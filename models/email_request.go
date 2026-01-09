package models

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"net/mail"
	"strconv"

	"github.com/jordan-wright/email"
	log "github.com/trust_strike/trust_strike/logger"
	"github.com/trust_strike/trust_strike/mailer"
)

// PreviewPrefix is the standard prefix added to the rid parameter when sending
// test emails.
const PreviewPrefix = "preview-"

// EmailRequest is the structure of a request
// to send a test email to test an SMTP connection.
// This type implements the mailer.Mail interface.
type EmailRequest struct {
	Id          int64        `json:"-"`
	Template    Template     `json:"template"`
	TemplateId  int64        `json:"-"`
	PageId      int64        `json:"-"`
	SMTP        SMTP         `json:"smtp"`
	URL         string       `json:"url"`
	Tracker     string       `json:"tracker" gorm:"-"`
	TrackingURL string       `json:"tracking_url" gorm:"-"`
	UserId      int64        `json:"-"`
	ErrorChan   chan (error) `json:"-" gorm:"-"`
	RId         string       `json:"id"`
	FromAddress string       `json:"-"`
	BaseRecipient
	QRSize int `json:"qr_size"`
}

func (s *EmailRequest) getBaseURL() string {
	return s.URL
}

func (s *EmailRequest) getFromAddress() string {
	return s.FromAddress
}

func (s *EmailRequest) getQRSize() string {
	if s.QRSize <= 0 {
		return ""
	}
	return strconv.Itoa(s.QRSize)
}

func (s *EmailRequest) getTrackingURL() string {
	return s.URL
}

// Validate ensures the SendTestEmailRequest structure
// is valid.
func (s *EmailRequest) Validate() error {
	switch {
	case s.Email == "":
		return ErrEmailNotSpecified
	case s.FromAddress == "" && s.SMTP.FromAddress == "":
		return ErrFromAddressNotSpecified
	}
	return nil
}

// Backoff treats temporary errors as permanent since this is expected to be a
// synchronous operation. It returns any errors given back to the ErrorChan
func (s *EmailRequest) Backoff(reason error) error {
	s.ErrorChan <- reason
	return nil
}

// Error returns an error on the ErrorChan.
func (s *EmailRequest) Error(err error) error {
	s.ErrorChan <- err
	return nil
}

// Success returns nil on the ErrorChan to indicate that the email was sent
// successfully.
func (s *EmailRequest) Success() error {
	s.ErrorChan <- nil
	return nil
}

func (s *EmailRequest) GetSmtpFrom() (string, error) {
	return s.SMTP.FromAddress, nil
}

func (s *EmailRequest) GetTo() []string {
	return []string{s.Email}
}

// PostEmailRequest stores a SendTestEmailRequest in the database.
func PostEmailRequest(s *EmailRequest) error {
	// Generate an ID to be used in the underlying Result object
	rid, err := generateResultId()
	if err != nil {
		return err
	}
	s.RId = fmt.Sprintf("%s%s", PreviewPrefix, rid)
	return db.Save(&s).Error
}

// GetEmailRequestByResultId retrieves the EmailRequest by the underlying rid
// parameter.
func GetEmailRequestByResultId(id string) (EmailRequest, error) {
	s := EmailRequest{}
	err := db.Table("email_requests").Where("r_id=?", id).First(&s).Error
	return s, err
}

// Generate fills in the details of a gomail.Message with the contents
// from the SendTestEmailRequest.
func (s *EmailRequest) Generate(msg *email.Email) error {
	f, err := mail.ParseAddress(s.getFromAddress())
	if err != nil {
		return err
	}
	msg.From = f.String()

	ptx, err := NewPhishingTemplateContext(s, s.BaseRecipient, s.RId)
	if err != nil {
		return err
	}

	if ptx.QRBase64 != "" {
		qrContent, err := base64.StdEncoding.DecodeString(ptx.QRBase64)
		if err != nil {
			return err
		}
		at, err := msg.Attach(bytes.NewReader(qrContent), ptx.QRName, "image/png")
		if err != nil {
			return err
		}
		at.HTMLRelated = true
		at.Header.Set("Content-ID", "<"+ptx.QRName+">")
	}

	url, err := ExecuteTemplate(s.URL, ptx)
	if err != nil {
		return err
	}
	s.URL = url

	// Parse the customHeader templates
	for _, header := range s.SMTP.Headers {
		key, err := ExecuteTemplate(header.Key, ptx)
		if err != nil {
			log.Error(err)
		}

		value, err := ExecuteTemplate(header.Value, ptx)
		if err != nil {
			log.Error(err)
		}

		// Add our header immediately
		msg.Headers.Set(key, value)
	}

	// Parse remaining templates
	subject, err := ExecuteTemplate(s.Template.Subject, ptx)
	if err != nil {
		log.Error(err)
	}
	// don't set the Subject header if it is blank
	if subject != "" {
		msg.Subject = subject
	}

	msg.To = []string{s.FormatAddress()}
	if s.Template.Text != "" {
		text, err := ExecuteTemplate(s.Template.Text, ptx)
		if err != nil {
			log.Error(err)
		}
		msg.Text = []byte(text)
	}
	if s.Template.HTML != "" {
		html, err := ExecuteTemplate(s.Template.HTML, ptx)
		if err != nil {
			log.Error(err)
		}
		msg.HTML = []byte(html)
	}

	// Attach the files
	for _, a := range s.Template.Attachments {
		addAttachment(msg, a, ptx)
	}

	return nil
}

// GetDialer returns the mailer.Dialer for the underlying SMTP object
func (s *EmailRequest) GetDialer() (mailer.Dialer, error) {
	return s.SMTP.GetDialer()
}
