package models

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"net/mail"
	"net/url"
	"strconv"
	"text/template"
	"time"

	"github.com/skip2/go-qrcode"
	"github.com/trust_strike/trust_strike/simulation"
)

// TemplateContext is an interface that allows both campaigns and email
// requests to have a PhishingTemplateContext generated for them.
type TemplateContext interface {
	getFromAddress() string
	getBaseURL() string
	getQRSize() string
	getTrackingURL() string
}

// PhishingTemplateContext is the context that is sent to any template, such
// as the email or landing page content.
type PhishingTemplateContext struct {
	From        string
	URL         string
	QR          string
	QRBase64    string
	QRName      string
	Tracker     string
	TrackingURL string
	RId         string
	BaseURL     string
	BaseRecipient
}

// NewPhishingTemplateContext returns a populated PhishingTemplateContext,
// parsing the correct fields from the provided TemplateContext and recipient.
func NewPhishingTemplateContext(ctx TemplateContext, r BaseRecipient, rid string) (PhishingTemplateContext, error) {
	f, err := mail.ParseAddress(ctx.getFromAddress())
	if err != nil {
		return PhishingTemplateContext{}, err
	}
	fn := f.Name
	if fn == "" {
		fn = f.Address
	}
	templateURL, err := ExecuteTemplate(ctx.getBaseURL(), r)
	if err != nil {
		return PhishingTemplateContext{}, err
	}

	// For the base URL, we'll reset the the path and the query
	// This will create a URL in the form of http://example.com
	baseURL, err := url.Parse(templateURL)
	if err != nil {
		return PhishingTemplateContext{}, err
	}
	baseURL.Path = ""
	baseURL.RawQuery = ""

	baseLureURL, err := url.Parse(templateURL)
	if err != nil {
		return PhishingTemplateContext{}, err
	}

	q := url.Values{}
	urlQuery := url.Values{}
	_query := baseLureURL.Query()
	for k, v := range _query {
		params, ok, _ := simulation.ExtractPhishUrlParams(v[0], "")
		if ok {
			for pk, pv := range params {
				q.Set(pk, pv)
			}
		} else {
			urlQuery.Set(k, v[0])
		}
	}
	baseLureURL.RawQuery = urlQuery.Encode()

	phishURL := *baseLureURL

	q.Set("fname", r.FirstName)
	q.Set("lname", r.LastName)
	q.Set("email", r.Email)
	q.Set("rid", rid)

	simulation.AddPhishUrlParams(&phishURL, q, "")

	// Logic for "Tracking only": Encode redirect URL and add as 'rd' parameter
	// We append it AFTER AddPhishUrlParams so it remains a visible/accessible query parameter
	// and is not encrypted into the 'um' blob.
	if c, ok := ctx.(*Campaign); ok && c.AttackObjective == "Tracking only" {
		if c.RedirectURL != "" {
			// Encrypt using AES-CFB with hardcoded secret
			// Key length must be 32 bytes for AES-256
			secretKey := "TrustStrikeSecretKey12345678" // 28 chars? Wait.
			// "TrustStrikeSecretKey12345678" length is 28. AES-256 needs 32.
			// "TrustStrikeSecretKey123456789012" is 32.
			secretKey = "TrustStrikeSecretKey123456789012"

			encodedRd, err := simulation.EncryptRD(c.RedirectURL, secretKey)
			if err != nil {
				fmt.Printf("Error encrypting RD: %v\n", err)
				encodedRd = "error"
			}

			query := phishURL.Query()
			query.Set("rd", encodedRd)
			phishURL.RawQuery = query.Encode()
			// Log for debugging
			fmt.Printf("Injecting Encrypted RD param: %s for %s\n", encodedRd, c.RedirectURL)
		} else {
			fmt.Println("Warning: Tracking Only selected but RedirectURL is empty!")
		}
	}

	phishUrlString := phishURL.String()

	// Build tracking URL from the tracking URL base (always use main server URL)
	trackingTemplateURL, err := ExecuteTemplate(ctx.getTrackingURL(), r)
	if err != nil {
		return PhishingTemplateContext{}, err
	}
	baseTrackingURL, err := url.Parse(trackingTemplateURL)
	if err != nil {
		return PhishingTemplateContext{}, err
	}

	trackingURL := *baseTrackingURL
	q = url.Values{}
	q.Set("rid", rid)
	q.Set("o", "track")
	simulation.AddPhishUrlParams(&trackingURL, q, "")
	trackerUrlString := trackingURL.String()

	qrBase64 := ""
	qrName := ""
	qr := ""
	qrSize := ctx.getQRSize()
	if qrSize != "" {
		qrBase64, qrName, err = generateQRCode(phishUrlString, qrSize)
		if err != nil {
			return PhishingTemplateContext{}, err
		}
		qr = "<img src=\"cid:" + qrName + "\">"
	}

	return PhishingTemplateContext{
		BaseRecipient: r,
		BaseURL:       baseURL.String(),
		URL:           phishUrlString,
		TrackingURL:   trackerUrlString,
		Tracker:       "<img alt='' style='display: none' src='" + trackerUrlString + "'/>",
		From:          fn,
		RId:           rid,
		QRBase64:      qrBase64,
		QRName:        qrName,
		QR:            qr,
	}, nil
}

// NewPhishingTemplateContextSms returns a populated PhishingTemplateContext for SMS
func NewPhishingTemplateContextSms(ctx TemplateContext, r BaseRecipient, rid string) (PhishingTemplateContext, error) {
	templateURL, err := ExecuteTemplate(ctx.getBaseURL(), r)
	if err != nil {
		return PhishingTemplateContext{}, err
	}

	baseURL, err := url.Parse(templateURL)
	if err != nil {
		return PhishingTemplateContext{}, err
	}
	baseURL.Path = ""
	baseURL.RawQuery = ""

	baseLureURL, err := url.Parse(templateURL)
	if err != nil {
		return PhishingTemplateContext{}, err
	}

	q := url.Values{}
	urlQuery := url.Values{}
	_query := baseLureURL.Query()
	for k, v := range _query {
		params, ok, _ := simulation.ExtractPhishUrlParams(v[0], "")
		if ok {
			for pk, pv := range params {
				q.Set(pk, pv)
			}
		} else {
			urlQuery.Set(k, v[0])
		}
	}
	baseLureURL.RawQuery = urlQuery.Encode()

	phishURL := *baseLureURL

	q.Set("fname", r.FirstName)
	q.Set("lname", r.LastName)
	q.Set("email", r.Email)
	q.Set("rid", rid)

	simulation.AddPhishUrlParams(&phishURL, q, "")

	phishUrlString := phishURL.String()

	return PhishingTemplateContext{
		BaseRecipient: r,
		BaseURL:       baseURL.String(),
		URL:           phishUrlString,
		RId:           rid,
		From:          ctx.getFromAddress(),
	}, nil
}

func generateQRCode(text string, sizeStr string) (string, string, error) {
	size, err := strconv.Atoi(sizeStr)
	if err != nil {
		return "", "", err
	}
	qrPng, err := qrcode.Encode(text, qrcode.Medium, size)
	if err != nil {
		return "", "", err
	}
	qrBase64 := base64.StdEncoding.EncodeToString(qrPng)
	qrName := fmt.Sprintf("qr_%d.png", time.Now().UnixNano())
	return qrBase64, qrName, nil
}

// ExecuteTemplate creates a templated string based on the provided
// template body and data.
func ExecuteTemplate(text string, data interface{}) (string, error) {
	buff := bytes.Buffer{}
	tmpl, err := template.New("template").Parse(text)
	if err != nil {
		return buff.String(), err
	}
	err = tmpl.Execute(&buff, data)
	return buff.String(), err
}

// ValidationContext is used for validating templates and pages
type ValidationContext struct {
	FromAddress string
	BaseURL     string
}

func (vc ValidationContext) getFromAddress() string {
	return vc.FromAddress
}

func (vc ValidationContext) getBaseURL() string {
	return vc.BaseURL
}

func (vc ValidationContext) getQRSize() string {
	return "150" // Standard size for validation
}

func (vc ValidationContext) getTrackingURL() string {
	return vc.BaseURL
}

// ValidateTemplate ensures that the provided text in the page or template
// uses the supported template variables correctly.
func ValidateTemplate(text string) error {
	vc := ValidationContext{
		FromAddress: "foo@bar.com",
		BaseURL:     "http://example.com",
	}
	td := Result{
		BaseRecipient: BaseRecipient{
			Email:     "foo@bar.com",
			FirstName: "Foo",
			LastName:  "Bar",
			Position:  "Test",
		},
		RId: "123456",
	}
	ptx, err := NewPhishingTemplateContext(vc, td.BaseRecipient, td.RId)
	if err != nil {
		return err
	}
	_, err = ExecuteTemplate(text, ptx)
	if err != nil {
		return err
	}
	return nil
}
