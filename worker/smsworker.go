package worker

import (
	"time"

	log "github.com/trust_strike/trust_strike/logger"
	"github.com/trust_strike/trust_strike/models"
	"github.com/trust_strike/trust_strike/smser"
)

// SMSWorker handles the background processing of SMS campaigns.
type SMSWorker struct{}

// NewSMSWorker creates a new SMSWorker object.
func NewSMSWorker() (Worker, error) {
	return &SMSWorker{}, nil
}

// Start launches the SMS worker to poll the database every minute for any pending smslogs
// that need to be processed.
func (w *SMSWorker) Start() {
	log.Info("SMS Background Worker Started Successfully - Waiting for Campaigns")
	for t := range time.Tick(1 * time.Minute) {
		err := w.processCampaigns(t)
		if err != nil {
			log.Error(err)
			continue
		}
	}
}

// processCampaigns loads smslogs scheduled to be sent before the provided
// time and sends them via Twilio.
func (w *SMSWorker) processCampaigns(t time.Time) error {
	sms, err := models.GetQueuedSmsLogs(t.UTC())
	if err != nil {
		log.Error(err)
		return err
	}
	// Lock the SmsLogs (they will be unlocked after processing)
	err = models.LockSmsLogs(sms, true)
	if err != nil {
		return err
	}

	for _, s := range sms {
		go func(s *models.SmsLog) {
			msg := &smser.TwilioMessage{}
			err := s.Generate(msg)
			if err != nil {
				log.Error(err)
				s.Error(err)
				return
			}
			_, err = msg.Client.Api.CreateMessage(&msg.Params)
			if err != nil {
				log.Errorf("Twilio error: %v", err)
				s.Backoff(err)
				return
			}
			s.Success()
		}(s)
	}
	return nil
}

// LaunchCampaign starts an SMS campaign
func (w *SMSWorker) LaunchCampaign(c models.Campaign) {
	sms, err := models.GetSmsLogsByCampaign(c.Id)
	if err != nil {
		log.Error(err)
		return
	}
	models.LockSmsLogs(sms, true)
	currentTime := time.Now().UTC()
	campaignSMSCtx, err := models.GetCampaignSMSContext(c.Id, c.UserId)
	if err != nil {
		log.Error(err)
		return
	}
	for _, s := range sms {
		if s.SendDate.After(currentTime) {
			s.Unlock()
			continue
		}
		s.CacheCampaign(&campaignSMSCtx)

		msg := &smser.TwilioMessage{}
		err := s.Generate(msg)
		if err != nil {
			log.Error(err)
			s.Error(err)
			continue
		}
		_, err = msg.Client.Api.CreateMessage(&msg.Params)
		if err != nil {
			log.Errorf("Twilio error: %v", err)
			s.Backoff(err)
			continue
		}
		s.Success()
	}
}

// SendTestSMS sends a test SMS
func (w *SMSWorker) SendTestSMS(s *models.SmsRequest) error {
	go func() {
		msg := &smser.TwilioMessage{}
		err := s.Generate(msg)
		if err != nil {
			log.Error(err)
			s.Error(err)
			return
		}
		_, err = msg.Client.Api.CreateMessage(&msg.Params)
		if err != nil {
			log.Errorf("Twilio error: %v", err)
			s.Backoff(err)
			return
		}
		s.Success()
	}()
	return <-s.ErrorChan
}

// SendTestEmail is a no-op for SMSWorker
func (w *SMSWorker) SendTestEmail(s *models.EmailRequest) error {
	return nil
}
