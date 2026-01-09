package models

import (
	"errors"
	"net/url"
	"strconv"
	"time"

	"github.com/jinzhu/gorm"
	"github.com/sirupsen/logrus"
	log "github.com/trust_strike/trust_strike/logger"
	"github.com/trust_strike/trust_strike/webhook"
)

// Campaign is a struct representing a created campaign
type Campaign struct {
	Id                int64     `json:"id"`
	UserId            int64     `json:"-"`
	Name              string    `json:"name" sql:"not null"`
	CreatedDate       time.Time `json:"created_date"`
	LaunchDate        time.Time `json:"launch_date"`
	SendByDate        time.Time `json:"send_by_date"`
	ScheduledStopDate time.Time `json:"scheduled_stop_date"`
	CompletedDate     time.Time `json:"completed_date"`
	TemplateId        int64     `json:"-"`
	Template          Template  `json:"template"`
	PageId            int64     `json:"-"`
	Page              Page      `json:"page"`
	Status            string    `json:"status"`
	Results           []Result  `json:"results,omitempty"`
	Groups            []Group   `json:"groups,omitempty"`
	Events            []Event   `json:"timeline,omitempty"`
	SMTPId            int64     `json:"-"`
	SMTP              SMTP      `json:"smtp"`
	SMSId             int64     `json:"-"`
	SMS               SMS       `json:"sms"`
	URL               string    `json:"url"`
	CampaignType      string    `json:"campaign_type"`
	QRSize            int       `json:"qr_size"`
	CreatedBy         string    `json:"created_by" sql:"-"`
	AttackObjective   string    `json:"attack_objective"`
	RedirectURL       string    `json:"redirect_url"`
	LandingURL        string    `json:"landing_url"`
}

// CampaignResults is a struct representing the results from a campaign
type CampaignResults struct {
	Id           int64    `json:"id"`
	Name         string   `json:"name"`
	Status       string   `json:"status"`
	CampaignType string   `json:"campaign_type"`
	Results      []Result `json:"results,omitempty"`
	Events       []Event  `json:"timeline,omitempty"`
}

// CampaignSummaries is a struct representing the overview of campaigns
type CampaignSummaries struct {
	Total     int64             `json:"total"`
	Campaigns []CampaignSummary `json:"campaigns"`
}

// CampaignSummary is a struct representing the overview of a single camaign
type CampaignSummary struct {
	Id            int64         `json:"id"`
	CreatedDate   time.Time     `json:"created_date"`
	LaunchDate    time.Time     `json:"launch_date"`
	SendByDate    time.Time     `json:"send_by_date"`
	CompletedDate time.Time     `json:"completed_date"`
	Status        string        `json:"status"`
	Name          string        `json:"name"`
	CampaignType  string        `json:"campaign_type"`
	Stats         CampaignStats `json:"stats"`
	CreatedBy     string        `json:"created_by" sql:"-"`
}

// CampaignStats is a struct representing the statistics for a single campaign
type CampaignStats struct {
	Total         int64 `json:"total"`
	EmailsSent    int64 `json:"sent"`
	OpenedEmail   int64 `json:"opened"`
	ClickedLink   int64 `json:"clicked"`
	SubmittedData int64 `json:"submitted_data"`
	EmailReported int64 `json:"email_reported"`
	Error         int64 `json:"error"`
}

// Event contains the fields for an event
// that occurs during the campaign
type Event struct {
	Id         int64     `json:"-"`
	CampaignId int64     `json:"campaign_id"`
	Email      string    `json:"email"`
	Time       time.Time `json:"time"`
	Message    string    `json:"message"`
	Details    string    `json:"details"`
}

// EventDetails is a struct that wraps common attributes we want to store
// in an event
type EventDetails struct {
	Payload url.Values        `json:"payload"`
	Browser map[string]string `json:"browser"`
}

// EventError is a struct that wraps an error that occurs when sending an
// email to a recipient
type EventError struct {
	Error string `json:"error"`
}

// ErrCampaignNameNotSpecified indicates there was no template given by the user
var ErrCampaignNameNotSpecified = errors.New("Campaign name not specified")

// ErrGroupNotSpecified indicates there was no template given by the user
var ErrGroupNotSpecified = errors.New("No groups specified")

// ErrTemplateNotSpecified indicates there was no template given by the user
var ErrTemplateNotSpecified = errors.New("No email template specified")

// ErrPageNotSpecified indicates a landing page was not provided for the campaign
var ErrPageNotSpecified = errors.New("No landing page specified")

// ErrSMTPNotSpecified indicates a sending profile was not provided for the campaign
var ErrSMTPNotSpecified = errors.New("No sending profile specified")

// ErrTemplateNotFound indicates the template specified does not exist in the database
var ErrTemplateNotFound = errors.New("Template not found")

// ErrGroupNotFound indicates a group specified by the user does not exist in the database
var ErrGroupNotFound = errors.New("Group not found")

// ErrPageNotFound indicates a page specified by the user does not exist in the database
var ErrPageNotFound = errors.New("Page not found")

// ErrSMTPNotFound indicates a sending profile specified by the user does not exist in the database
var ErrSMTPNotFound = errors.New("Sending profile not found")

// ErrInvalidSendByDate indicates that the user specified a send by date that occurs before the
// launch date
var ErrInvalidSendByDate = errors.New("The launch date must be before the \"send emails by\" date")

// RecipientParameter is the URL parameter that points to the result ID for a recipient.
const RecipientParameter = "rid"

func (c *Campaign) Validate() error {
	if c.Name == "" {
		return ErrCampaignNameNotSpecified
	}
	if len(c.Groups) == 0 {
		return ErrGroupNotSpecified
	}
	if c.Template.Name == "" {
		return ErrTemplateNotSpecified
	}
	// URL is mandatory unless we are in "Tracking only" mode where we might auto-generate it
	if c.AttackObjective != "Tracking only" && c.URL == "" {
		return errors.New("No URL specified")
	}
	if c.CampaignType == "sms" {
		if c.SMS.Name == "" {
			return errors.New("No SMS profile specified")
		}
	} else {
		if c.SMTP.Name == "" {
			return ErrSMTPNotSpecified
		}
	}
	if !c.SendByDate.IsZero() && !c.LaunchDate.IsZero() && c.SendByDate.Before(c.LaunchDate) {
		return ErrInvalidSendByDate
	}
	return nil
}

// UpdateStatus changes the campaign status appropriately
func (c *Campaign) UpdateStatus(s string) error {
	// This could be made simpler, but I think there's a bug in gorm
	return db.Table("campaigns").Where("id=?", c.Id).Update("status", s).Error
}

// AddEvent creates a new campaign event in the database
func AddEvent(e *Event, campaignID int64) error {
	e.CampaignId = campaignID
	e.Time = time.Now().UTC()

	whs, err := GetActiveWebhooks()
	if err == nil {
		whEndPoints := []webhook.EndPoint{}
		for _, wh := range whs {
			whEndPoints = append(whEndPoints, webhook.EndPoint{
				URL:    wh.URL,
				Secret: wh.Secret,
			})
		}
		webhook.SendAll(whEndPoints, e)
	} else {
		log.Errorf("error getting active webhooks: %v", err)
	}

	return db.Save(e).Error
}

// getDetails retrieves the related attributes of the campaign
// from the database. If the Events and the Results are not available,
// an error is returned. Otherwise, the attribute name is set to [Deleted],
// indicating the user deleted the attribute (template, smtp, etc.)
func (c *Campaign) getDetails() error {
	err := db.Model(c).Related(&c.Results).Error
	if err != nil {
		log.Warnf("%s: results not found for campaign", err)
		return err
	}
	err = db.Model(c).Related(&c.Events).Error
	if err != nil {
		log.Warnf("%s: events not found for campaign", err)
		return err
	}
	err = db.Table("templates").Where("id=?", c.TemplateId).Find(&c.Template).Error
	if err != nil {
		if err != gorm.ErrRecordNotFound {
			return err
		}
		c.Template = Template{Name: "[Deleted]"}
		log.Warnf("%s: template not found for campaign", err)
	}
	err = db.Where("template_id=?", c.Template.Id).Find(&c.Template.Attachments).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Warn(err)
		return err
	}
	err = db.Table("smtp").Where("id=?", c.SMTPId).Find(&c.SMTP).Error
	if err != nil {
		// Check if the SMTP was deleted
		if err != gorm.ErrRecordNotFound {
			return err
		}
		c.SMTP = SMTP{Name: "[Deleted]"}
		log.Warnf("%s: sending profile not found for campaign", err)
	}
	err = db.Where("smtp_id=?", c.SMTP.Id).Find(&c.SMTP.Headers).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Warn(err)
		return err
	}
	err = db.Table("sms").Where("id=?", c.SMSId).Find(&c.SMS).Error
	if err != nil {
		if err != gorm.ErrRecordNotFound {
			return err
		}
		c.SMS = SMS{Name: "[Deleted]"}
		log.Warnf("%s: sms profile not found for campaign", err)
	}
	return nil
}

// getBaseURL returns the Campaign's configured URL.
// This is used to implement the TemplateContext interface.
// getBaseURL returns the Campaign's URL to be used for template execution.
// If a LandingURL is configured, it takes precedence over the standard URL.
func (c *Campaign) getBaseURL() string {
	if c.LandingURL != "" {
		return c.LandingURL
	}
	return c.URL
}

// getQRSize returns the Campaign's configured QR code size.
// This is used to implement the TemplateContext interface.
func (c Campaign) getQRSize() string {
	if c.QRSize <= 0 {
		return ""
	}
	return strconv.Itoa(c.QRSize)
}

// getFromAddress returns the Campaign's configured SMTP "From" address.
// This is used to implement the TemplateContext interface.
func (c *Campaign) getFromAddress() string {
	return c.SMTP.FromAddress
}

// getTrackingURL always returns the original Campaign URL for tracking pixels.
// This ensures tracking always goes to the main server, not the landing domain.
func (c *Campaign) getTrackingURL() string {
	return c.URL
}

// generateSendDate creates a sendDate
func (c *Campaign) generateSendDate(idx int, totalRecipients int) time.Time {
	// If no send date is specified, just return the launch date
	if c.SendByDate.IsZero() || c.SendByDate.Equal(c.LaunchDate) {
		return c.LaunchDate
	}
	// Otherwise, we can calculate the range of minutes to send emails
	// (since we only poll once per minute)
	totalMinutes := c.SendByDate.Sub(c.LaunchDate).Minutes()

	// Next, we can determine how many minutes should elapse between emails
	minutesPerEmail := totalMinutes / float64(totalRecipients)

	// Then, we can calculate the offset for this particular email
	offset := int(minutesPerEmail * float64(idx))

	// Finally, we can just add this offset to the launch date to determine
	// when the email should be sent
	return c.LaunchDate.Add(time.Duration(offset) * time.Minute)
}

// getCampaignStats returns a CampaignStats object for the campaign with the given campaign ID.
// It also backfills numbers as appropriate with a running total, so that the values are aggregated.
func getCampaignStats(cid int64) (CampaignStats, error) {
	s := CampaignStats{}
	query := db.Table("results").Where("campaign_id = ?", cid)
	err := query.Count(&s.Total).Error
	if err != nil {
		return s, err
	}
	err = query.Where("status=?", EventDataSubmit).Count(&s.SubmittedData).Error
	if err != nil {
		return s, err
	}
	err = query.Where("status=?", EventClicked).Count(&s.ClickedLink).Error
	if err != nil {
		return s, err
	}
	err = query.Where("reported=?", true).Count(&s.EmailReported).Error
	if err != nil {
		return s, err
	}
	// Every submitted data event implies they clicked the link
	s.ClickedLink += s.SubmittedData
	err = query.Where("status=?", EventOpened).Count(&s.OpenedEmail).Error
	if err != nil {
		return s, err
	}
	// Every clicked link event implies they opened the email
	s.OpenedEmail += s.ClickedLink
	err = query.Where("status IN (?)", []string{EventSent, EventSMSSent}).Count(&s.EmailsSent).Error
	if err != nil {
		return s, err
	}
	// Every opened email event implies the email was sent
	s.EmailsSent += s.OpenedEmail
	err = query.Where("status=?", Error).Count(&s.Error).Error
	return s, err
}

// GetCampaigns returns the campaigns owned by the given user.
func GetCampaigns(uid int64, campaignType string) ([]Campaign, error) {
	cs := []Campaign{}
	query := db.Model(&Campaign{})
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return cs, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	if campaignType != "" {
		query = query.Where("campaign_type = ?", campaignType)
	}
	err := query.Find(&cs).Error
	if err != nil {
		log.Error(err)
	}
	for i := range cs {
		err = cs[i].getDetails()
		if err != nil {
			log.Error(err)
		}
	}
	return cs, err
}

// GetCampaignSummaries gets the summary objects for all the campaigns
// owned by the current user
func GetCampaignSummaries(uid int64, campaignType string) (CampaignSummaries, error) {
	overview := CampaignSummaries{}
	cs := []CampaignSummary{}
	// Get the basic campaign information
	query := db.Table("campaigns")
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return overview, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	if campaignType != "" {
		query = query.Where("campaign_type = ?", campaignType)
	}
	query = query.Select("campaigns.id, campaigns.name, campaigns.campaign_type, campaigns.created_date, campaigns.launch_date, campaigns.send_by_date, campaigns.completed_date, campaigns.status, users.username as created_by").Joins("left join users on campaigns.user_id = users.id")
	err := query.Scan(&cs).Error
	if err != nil {
		log.Error(err)
		return overview, err
	}
	for i := range cs {
		s, err := getCampaignStats(cs[i].Id)
		if err != nil {
			log.Error(err)
			return overview, err
		}
		cs[i].Stats = s
	}
	overview.Total = int64(len(cs))
	overview.Campaigns = cs
	return overview, nil
}

func GetCampaignSummary(id int64, uid int64) (CampaignSummary, error) {
	cs := CampaignSummary{}
	query := db.Table("campaigns").Where("id = ?", id)
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return cs, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	query = query.Select("id, name, campaign_type, created_date, launch_date, send_by_date, completed_date, status")
	err := query.Scan(&cs).Error
	if err != nil {
		log.Error(err)
		return cs, err
	}
	s, err := getCampaignStats(cs.Id)
	if err != nil {
		log.Error(err)
		return cs, err
	}
	cs.Stats = s
	return cs, nil
}

func GetCampaignMailContext(id int64, uid int64) (Campaign, error) {
	c := Campaign{}
	query := db.Where("id = ?", id)
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return c, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	err := query.Find(&c).Error
	if err != nil {
		return c, err
	}
	err = db.Table("smtp").Where("id=?", c.SMTPId).Find(&c.SMTP).Error
	if err != nil {
		return c, err
	}
	err = db.Where("smtp_id=?", c.SMTP.Id).Find(&c.SMTP.Headers).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return c, err
	}
	err = db.Table("templates").Where("id=?", c.TemplateId).Find(&c.Template).Error
	if err != nil {
		return c, err
	}
	err = db.Where("template_id=?", c.Template.Id).Find(&c.Template.Attachments).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return c, err
	}
	return c, nil
}

// GetCampaign returns the campaign, if it exists, specified by the given id and user_id.
func GetCampaign(id int64, uid int64) (Campaign, error) {
	c := Campaign{}
	query := db.Where("id = ?", id)
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return c, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	err := query.Find(&c).Error
	if err != nil {
		log.Errorf("%s: campaign not found", err)
		return c, err
	}
	err = c.getDetails()
	return c, err
}

// GetCampaignResults returns just the campaign results for the given campaign
func GetCampaignResults(id int64, uid int64) (CampaignResults, error) {
	cr := CampaignResults{}
	query := db.Table("campaigns").Where("id = ?", id)
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return cr, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	err := query.Find(&cr).Error
	if err != nil {
		log.WithFields(logrus.Fields{
			"campaign_id": id,
			"error":       err,
		}).Error(err)
		return cr, err
	}
	err = db.Table("results").Where("campaign_id=?", cr.Id).Find(&cr.Results).Error
	if err != nil {
		log.Errorf("%s: results not found for campaign", err)
		return cr, err
	}
	err = db.Table("events").Where("campaign_id=?", cr.Id).Find(&cr.Events).Error
	if err != nil {
		log.Errorf("%s: events not found for campaign", err)
		return cr, err
	}
	return cr, err
}

// GetQueuedCampaigns returns the campaigns that are queued up for this given minute
func GetQueuedCampaigns(t time.Time) ([]Campaign, error) {
	cs := []Campaign{}
	err := db.Where("launch_date <= ?", t).
		Where("status = ?", CampaignQueued).Find(&cs).Error
	if err != nil {
		log.Error(err)
	}
	log.Infof("Found %d Campaigns to run\n", len(cs))
	for i := range cs {
		err = cs[i].getDetails()
		if err != nil {
			log.Error(err)
		}
	}
	return cs, err
}

// GetExpiredCampaigns returns the active campaigns that have reached their scheduled stop date
func GetExpiredCampaigns(t time.Time) ([]Campaign, error) {
	cs := []Campaign{}
	// Check for campaigns that are In Progress and ScheduledStopDate is set and passed
	err := db.Where("scheduled_stop_date <= ?", t).
		Where("scheduled_stop_date > ?", time.Time{}). // Ensure it's not zero
		Where("status = ?", CampaignInProgress).Find(&cs).Error
	if err != nil {
		log.Error(err)
	}
	if len(cs) > 0 {
		log.Infof("Found %d Expired Campaigns to stop\n", len(cs))
	}
	return cs, err
}

// PostCampaign inserts a campaign and all associated records into the database.
func PostCampaign(c *Campaign, uid int64) error {
	log.WithFields(logrus.Fields{
		"name":             c.Name,
		"attack_objective": c.AttackObjective,
		"redirect_url":     c.RedirectURL,
		"landing_url":      c.LandingURL,
		"url":              c.URL,
	}).Info("DEBUG: Received PostCampaign request")

	err := c.Validate()
	if err != nil {
		return err
	}
	// Fill in the details
	c.UserId = uid
	c.CreatedDate = time.Now().UTC()
	c.CompletedDate = time.Time{}
	c.Status = CampaignQueued
	if c.CampaignType == "" {
		c.CampaignType = "email"
	}
	if c.LaunchDate.IsZero() {
		c.LaunchDate = c.CreatedDate
	} else {
		c.LaunchDate = c.LaunchDate.UTC()
	}
	if !c.SendByDate.IsZero() {
		c.SendByDate = c.SendByDate.UTC()
	}
	if !c.ScheduledStopDate.IsZero() {
		c.ScheduledStopDate = c.ScheduledStopDate.UTC()
	}
	if c.LaunchDate.Before(c.CreatedDate) || c.LaunchDate.Equal(c.CreatedDate) {
		c.Status = CampaignInProgress
	}
	// Check to make sure all the groups already exist
	// Also, later we'll need to know the total number of recipients (counting
	// duplicates is ok for now), so we'll do that here to save a loop.
	totalRecipients := 0
	for i, g := range c.Groups {
		c.Groups[i], err = GetGroupByName(g.Name, uid)
		if err == gorm.ErrRecordNotFound {
			log.WithFields(logrus.Fields{
				"group": g.Name,
			}).Error("Group does not exist")
			return ErrGroupNotFound
		} else if err != nil {
			log.Error(err)
			return err
		}
		totalRecipients += len(c.Groups[i].Targets)
	}
	// Check to make sure the template exists
	t, err := GetTemplateByName(c.Template.Name, uid)
	if err == gorm.ErrRecordNotFound {
		log.WithFields(logrus.Fields{
			"template": c.Template.Name,
		}).Error("Template does not exist")
		return ErrTemplateNotFound
	} else if err != nil {
		log.Error(err)
		return err
	}
	c.Template = t
	c.TemplateId = t.Id
	// Check to make sure the sending profile exists
	s, err := GetSMTPByName(c.SMTP.Name, uid)
	if err == gorm.ErrRecordNotFound {
		log.WithFields(logrus.Fields{
			"smtp": c.SMTP.Name,
		}).Error("Sending profile does not exist")
		return ErrSMTPNotFound
	} else if err != nil {
		log.Error(err)
		return err
	}
	c.SMTP = s
	c.SMTPId = s.Id
	// Insert into the DB
	err = db.Save(c).Error
	if err != nil {
		log.Error(err)
		return err
	}
	err = AddEvent(&Event{Message: "Campaign Created"}, c.Id)
	if err != nil {
		log.Error(err)
	}
	// Insert all the results
	resultMap := make(map[string]bool)
	recipientIndex := 0
	tx := db.Begin()
	for _, g := range c.Groups {
		// Insert a result for each target in the group
		for _, t := range g.Targets {
			// Remove duplicate results - we should only
			// send emails to unique email addresses.
			if _, ok := resultMap[t.Email]; ok {
				continue
			}
			resultMap[t.Email] = true
			sendDate := c.generateSendDate(recipientIndex, totalRecipients)
			r := &Result{
				BaseRecipient: BaseRecipient{
					Email:     t.Email,
					Position:  t.Position,
					FirstName: t.FirstName,
					LastName:  t.LastName,
				},
				Status:       StatusScheduled,
				CampaignId:   c.Id,
				UserId:       c.UserId,
				SendDate:     sendDate,
				Reported:     false,
				ModifiedDate: c.CreatedDate,
			}
			err = r.GenerateId(tx)
			if err != nil {
				log.Error(err)
				tx.Rollback()
				return err
			}
			processing := false
			if r.SendDate.Before(c.CreatedDate) || r.SendDate.Equal(c.CreatedDate) {
				r.Status = StatusSending
				processing = true
			}
			err = tx.Save(r).Error
			if err != nil {
				log.WithFields(logrus.Fields{
					"email": t.Email,
				}).Errorf("error creating result: %v", err)
				tx.Rollback()
				return err
			}
			c.Results = append(c.Results, *r)
			log.WithFields(logrus.Fields{
				"email":     r.Email,
				"send_date": sendDate,
			}).Debug("creating maillog")
			m := &MailLog{
				UserId:     c.UserId,
				CampaignId: c.Id,
				RId:        r.RId,
				SendDate:   sendDate,
				Processing: processing,
			}
			err = tx.Save(m).Error
			if err != nil {
				log.WithFields(logrus.Fields{
					"email": t.Email,
				}).Errorf("error creating maillog entry: %v", err)
				tx.Rollback()
				return err
			}
			recipientIndex++
		}
	}
	return tx.Commit().Error
}

// PostSMSCampaign inserts an SMS campaign and all associated records into the database.
func PostSMSCampaign(c *Campaign, uid int64) error {
	err := c.Validate()
	if err != nil {
		return err
	}
	// Fill in the details
	c.UserId = uid
	c.CreatedDate = time.Now().UTC()
	c.CompletedDate = time.Time{}
	c.Status = CampaignQueued
	c.CampaignType = "sms"
	if c.LaunchDate.IsZero() {
		c.LaunchDate = c.CreatedDate
	} else {
		c.LaunchDate = c.LaunchDate.UTC()
	}
	if !c.SendByDate.IsZero() {
		c.SendByDate = c.SendByDate.UTC()
	}
	if !c.ScheduledStopDate.IsZero() {
		c.ScheduledStopDate = c.ScheduledStopDate.UTC()
	}
	if c.LaunchDate.Before(c.CreatedDate) || c.LaunchDate.Equal(c.CreatedDate) {
		c.Status = CampaignInProgress
	}
	// Check to make sure all the groups already exist
	totalRecipients := 0
	for i, g := range c.Groups {
		c.Groups[i], err = GetGroupByName(g.Name, uid)
		if err == gorm.ErrRecordNotFound {
			log.WithFields(logrus.Fields{
				"group": g.Name,
			}).Error("Group does not exist")
			return ErrGroupNotFound
		} else if err != nil {
			log.Error(err)
			return err
		}
		totalRecipients += len(c.Groups[i].Targets)
	}
	// Check to make sure the template exists
	t, err := GetTemplateByName(c.Template.Name, uid)
	if err == gorm.ErrRecordNotFound {
		log.WithFields(logrus.Fields{
			"template": c.Template.Name,
		}).Error("Template does not exist")
		return ErrTemplateNotFound
	} else if err != nil {
		log.Error(err)
		return err
	}
	c.Template = t
	c.TemplateId = t.Id
	// Check to make sure the SMS profile exists
	s, err := GetSMSByName(c.SMS.Name, uid)
	if err == gorm.ErrRecordNotFound {
		log.WithFields(logrus.Fields{
			"sms": c.SMS.Name,
		}).Error("SMS profile does not exist")
		return errors.New("SMS profile not found")
	} else if err != nil {
		log.Error(err)
		return err
	}
	c.SMS = s
	c.SMSId = s.Id
	// Insert into the DB
	err = db.Save(c).Error
	if err != nil {
		log.Error(err)
		return err
	}
	err = AddEvent(&Event{Message: "SMS Campaign Created"}, c.Id)
	if err != nil {
		log.Error(err)
	}
	// Insert all the results
	resultMap := make(map[string]bool)
	recipientIndex := 0
	tx := db.Begin()
	for _, g := range c.Groups {
		for _, t := range g.Targets {
			if _, ok := resultMap[t.Email]; ok {
				continue
			}
			resultMap[t.Email] = true
			sendDate := c.generateSendDate(recipientIndex, totalRecipients)
			r := &Result{
				BaseRecipient: BaseRecipient{
					Email:     t.Email,
					Position:  t.Position,
					FirstName: t.FirstName,
					LastName:  t.LastName,
				},
				Status:       StatusScheduled,
				CampaignId:   c.Id,
				UserId:       c.UserId,
				SendDate:     sendDate,
				Reported:     false,
				ModifiedDate: c.CreatedDate,
			}
			err = r.GenerateId(tx)
			if err != nil {
				log.Error(err)
				tx.Rollback()
				return err
			}
			processing := false
			if r.SendDate.Before(c.CreatedDate) || r.SendDate.Equal(c.CreatedDate) {
				r.Status = StatusSending
				processing = true
			}
			err = tx.Save(r).Error
			if err != nil {
				tx.Rollback()
				return err
			}
			c.Results = append(c.Results, *r)
			m := &SmsLog{
				UserId:     c.UserId,
				CampaignId: c.Id,
				RId:        r.RId,
				SendDate:   sendDate,
				Processing: processing,
				Target:     t.Email, // Re-using Email field for Phone number in SMS
			}
			err = tx.Save(m).Error
			if err != nil {
				tx.Rollback()
				return err
			}
			recipientIndex++
		}
	}
	return tx.Commit().Error
}

func GetCampaignSMSContext(id int64, uid int64) (Campaign, error) {
	c := Campaign{}
	query := db.Where("id = ?", id)
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return c, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	err := query.Find(&c).Error
	if err != nil {
		return c, err
	}
	err = db.Table("sms").Where("id=?", c.SMSId).Find(&c.SMS).Error
	if err != nil {
		return c, err
	}
	err = db.Table("templates").Where("id=?", c.TemplateId).Find(&c.Template).Error
	if err != nil {
		return c, err
	}
	return c, nil
}

func DeleteCampaign(id int64, uid int64) error {
	log.WithFields(logrus.Fields{
		"campaign_id": id,
	}).Info("Deleting campaign")
	// Verify that the user has permission to delete this campaign
	c, err := GetCampaign(id, uid)
	if err != nil {
		return err
	}
	// If the user is not an admin and the campaign belongs to the admin, deny deletion
	// uid 0 is passed by controllers when the request comes from an Admin
	if uid != 0 && uid != 1 && c.UserId == 1 {
		return errors.New("Only administrators can delete this resource. Please contact the admin.")
	}
	// Delete all the campaign results
	err = db.Where("campaign_id=?", id).Delete(&Result{}).Error
	if err != nil {
		log.Error(err)
		return err
	}
	err = db.Where("campaign_id=?", id).Delete(&Event{}).Error
	if err != nil {
		log.Error(err)
		return err
	}
	err = db.Where("campaign_id=?", id).Delete(&MailLog{}).Error
	if err != nil {
		log.Error(err)
		return err
	}
	// Delete the campaign
	err = db.Delete(&Campaign{Id: id}).Error
	if err != nil {
		log.Error(err)
	}
	return err
}

// CompleteCampaign effectively "ends" a campaign.
// Any future emails clicked will return a simple "404" page.
func CompleteCampaign(id int64, uid int64) error {
	log.WithFields(logrus.Fields{
		"campaign_id": id,
	}).Info("Marking campaign as complete")
	c, err := GetCampaign(id, uid)
	if err != nil {
		return err
	}
	// Delete any maillogs still set to be sent out, preventing future emails
	err = db.Where("campaign_id=?", id).Delete(&MailLog{}).Error
	if err != nil {
		log.Error(err)
		return err
	}
	// Don't overwrite original completed time
	if c.Status == CampaignComplete {
		return nil
	}
	// Mark the campaign as complete
	c.CompletedDate = time.Now().UTC()
	c.Status = CampaignComplete
	err = db.Save(&c).Error
	if err != nil {
		log.Error(err)
	}
	return err
}
