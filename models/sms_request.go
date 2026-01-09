package models

import (
	"errors"
	"fmt"

	log "github.com/trust_strike/trust_strike/logger"
	"github.com/trust_strike/trust_strike/smser"
	"github.com/twilio/twilio-go"
	openapi "github.com/twilio/twilio-go/rest/api/v2010"
)

// SmsRequest is the structure of a request
// to send a test SMS to test an SMS connection.
type SmsRequest struct {
	Id         int64        `json:"-"`
	Template   Template     `json:"template"`
	TemplateId int64        `json:"-"`
	SMS        SMS          `json:"sms"`
	URL        string       `json:"url"`
	UserId     int64        `json:"-"`
	ErrorChan  chan (error) `json:"-" gorm:"-"`
	RId        string       `json:"id"`
	BaseRecipient
}

// Validate ensures the SmsRequest structure is valid.
func (s *SmsRequest) Validate() error {
	if s.Email == "" { // Re-using Email field for phone number
		return errors.New("No phone number specified")
	}
	return nil
}

// Backoff treats temporary errors as permanent
func (s *SmsRequest) Backoff(reason error) error {
	s.ErrorChan <- reason
	return nil
}

// Error returns an error on the ErrorChan.
func (s *SmsRequest) Error(err error) error {
	s.ErrorChan <- err
	return nil
}

// Success returns nil on the ErrorChan
func (s *SmsRequest) Success() error {
	s.ErrorChan <- nil
	return nil
}

// PostSmsRequest stores a SmsRequest in the database.
func PostSmsRequest(s *SmsRequest) error {
	rid, err := generateResultId()
	if err != nil {
		return err
	}
	s.RId = fmt.Sprintf("%s%s", PreviewPrefix, rid)
	return db.Save(&s).Error
}

func (s *SmsRequest) Generate(msg *smser.TwilioMessage) error {
	ptx, err := NewPhishingTemplateContextSms(nil, s.BaseRecipient, s.RId)
	if err != nil {
		return err
	}

	// Try to get updated template if name is provided
	if s.Template.Name != "" {
		t, err := GetTemplateByName(s.Template.Name, s.UserId)
		if err == nil {
			s.Template = t
		}
	}

	if s.Template.Text != "" {
		text, err := ExecuteTemplate(s.Template.Text, ptx)
		if err != nil {
			log.Warn(err)
		}

		msg.Client = *twilio.NewRestClientWithParams(twilio.ClientParams{Username: s.SMS.TwilioAccountSid, Password: s.SMS.TwilioAuthToken})
		msg.Params = openapi.CreateMessageParams{
			To:   &s.Email, // Re-using Email field for phone number
			From: &s.SMS.SMSFrom,
			Body: &text,
		}
	} else {
		return fmt.Errorf("No text template specified")
	}

	return nil
}
