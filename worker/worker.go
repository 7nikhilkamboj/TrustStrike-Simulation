package worker

import (
	"context"
	"time"

	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/mailer"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/sirupsen/logrus"
)

// Worker is an interface that defines the operations needed for a background worker
type Worker interface {
	Start()
	LaunchCampaign(c models.Campaign)
	SendTestEmail(s *models.EmailRequest) error
	SendTestSMS(s *models.SmsRequest) error
}

// DefaultWorker is the background worker that handles watching for new campaigns and sending emails appropriately.
type DefaultWorker struct {
	mailer mailer.Mailer
}

// New creates a new worker object to handle the creation of campaigns
func New(options ...func(Worker) error) (Worker, error) {
	defaultMailer := mailer.NewMailWorker()
	w := &DefaultWorker{
		mailer: defaultMailer,
	}
	for _, opt := range options {
		if err := opt(w); err != nil {
			return nil, err
		}
	}
	return w, nil
}

// WithMailer sets the mailer for a given worker.
// By default, workers use a standard, default mailworker.
func WithMailer(m mailer.Mailer) func(*DefaultWorker) error {
	return func(w *DefaultWorker) error {
		w.mailer = m
		return nil
	}
}

// processCampaigns loads maillogs scheduled to be sent before the provided
// time and sends them to the mailer.
func (w *DefaultWorker) processCampaigns(t time.Time) error {
	ms, err := models.GetQueuedMailLogs(t.UTC())
	if err != nil {
		log.Error(err)
		return err
	}
	// Lock the MailLogs (they will be unlocked after processing)
	err = models.LockMailLogs(ms, true)
	if err != nil {
		return err
	}
	campaignCache := make(map[int64]models.Campaign)
	// We'll group the maillogs by campaign ID to (roughly) group
	// them by sending profile. This lets the mailer re-use the Sender
	// instead of having to re-connect to the SMTP server for every
	// email.
	msg := make(map[int64][]mailer.Mail)
	for _, m := range ms {
		// We cache the campaign here to greatly reduce the time it takes to
		// generate the message (ref #1726)
		c, ok := campaignCache[m.CampaignId]
		if !ok {
			c, err = models.GetCampaignMailContext(m.CampaignId, m.UserId)
			if err != nil {
				return err
			}
			campaignCache[c.Id] = c
		}
		m.CacheCampaign(&c)
		msg[m.CampaignId] = append(msg[m.CampaignId], m)
	}

	// Next, we process each group of maillogs in parallel
	for cid, msc := range msg {
		go func(cid int64, msc []mailer.Mail) {
			c := campaignCache[cid]
			if c.Status == models.CampaignQueued {
				err := c.UpdateStatus(models.CampaignInProgress)
				if err != nil {
					log.Error(err)
					return
				}
			}
			log.WithFields(logrus.Fields{
				"num_emails": len(msc),
			}).Info("Sending emails to mailer for processing")
			w.mailer.Queue(msc)
		}(cid, msc)
	}
	return nil
}

// processShutdowns checks for running campaigns that have passed their
// scheduled stop time and stops the EC2 instance.
func (w *DefaultWorker) processShutdowns(t time.Time) error {
	cs, err := models.GetExpiredCampaigns(t.UTC())
	if err != nil {
		log.Error(err)
		return err
	}

	for _, c := range cs {
		log.Infof("Campaign %s (ID: %d) has reached scheduled stop time. Stopping EC2...", c.Name, c.Id)

		// Stop EC2
		err := stopEC2()
		if err != nil {
			log.Errorf("Failed to stop EC2 for campaign %d: %v", c.Id, err)
			continue
		}

		// Update campaign status
		c.Status = models.CampaignComplete
		// We use a completed date of Now
		c.CompletedDate = time.Now().UTC()

		// Save status update
		err = c.UpdateStatus(models.CampaignComplete)
		if err != nil {
			log.Errorf("Failed to update status for campaign %d: %v", c.Id, err)
		} else {
			log.Infof("Campaign %d stopped and marked as Completed", c.Id)
		}
	}
	return nil
}

// stopEC2 connects to AWS and stops the configured instance
func stopEC2() error {
	conf := models.GetConfig()
	if conf == nil {
		return context.Canceled // Config not loaded
	}
	cfg := conf.EC2

	if cfg.AWSAccessKeyID == "" || cfg.AWSSecretAccessKey == "" {
		return context.Canceled // Credentials missing
	}

	awsCfg := aws.Config{
		Region: cfg.AWSRegion,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AWSAccessKeyID,
			cfg.AWSSecretAccessKey,
			"",
		),
	}

	client := ec2.NewFromConfig(awsCfg)
	ctx := context.Background()

	// Stop the instance
	_, err := client.StopInstances(ctx, &ec2.StopInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil {
		return err
	}

	return nil
}

// Start launches the worker to poll the database every minute for any pending maillogs
// that need to be processed.
func (w *DefaultWorker) Start() {
	log.Info("Background Worker Started Successfully - Waiting for Campaigns")
	go w.mailer.Start(context.Background())
	for t := range time.Tick(1 * time.Minute) {
		err := w.processCampaigns(t)
		if err != nil {
			log.Error(err)
			continue
		}
		// Also process scheduled shutdowns
		err = w.processShutdowns(t)
		if err != nil {
			log.Error(err)
		}
	}
}

// LaunchCampaign starts a campaign
func (w *DefaultWorker) LaunchCampaign(c models.Campaign) {
	ms, err := models.GetMailLogsByCampaign(c.Id)
	if err != nil {
		log.Error(err)
		return
	}
	models.LockMailLogs(ms, true)
	// This is required since you cannot pass a slice of values
	// that implements an interface as a slice of that interface.
	mailEntries := []mailer.Mail{}
	currentTime := time.Now().UTC()
	campaignMailCtx, err := models.GetCampaignMailContext(c.Id, c.UserId)
	if err != nil {
		log.Error(err)
		return
	}
	for _, m := range ms {
		// Only send the emails scheduled to be sent for the past minute to
		// respect the campaign scheduling options
		if m.SendDate.After(currentTime) {
			m.Unlock()
			continue
		}
		err = m.CacheCampaign(&campaignMailCtx)
		if err != nil {
			log.Error(err)
			return
		}
		mailEntries = append(mailEntries, m)
	}
	w.mailer.Queue(mailEntries)
}

// SendTestEmail sends a test email
func (w *DefaultWorker) SendTestEmail(s *models.EmailRequest) error {
	go func() {
		ms := []mailer.Mail{s}
		w.mailer.Queue(ms)
	}()
	return <-s.ErrorChan
}

// SendTestSMS is a no-op for DefaultWorker as it handles emails
func (w *DefaultWorker) SendTestSMS(s *models.SmsRequest) error {
	return nil
}
