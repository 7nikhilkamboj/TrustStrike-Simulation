package models

import (
	check "gopkg.in/check.v1"
)

type mockTemplateContext struct {
	URL         string
	FromAddress string
}

func (m mockTemplateContext) getFromAddress() string {
	return m.FromAddress
}

func (m mockTemplateContext) getBaseURL() string {
	return m.URL
}

func (m mockTemplateContext) getQRSize() string {
	return ""
}

func (m mockTemplateContext) getTrackingURL() string {
	return m.URL
}

func (s *ModelsSuite) TestNewTemplateContext(c *check.C) {
	r := Result{
		BaseRecipient: BaseRecipient{
			FirstName: "Foo",
			LastName:  "Bar",
			Email:     "foo@bar.com",
		},
		RId: "1234567",
	}
	ctx := mockTemplateContext{
		URL:         "http://example.com",
		FromAddress: "From Address <from@example.com>",
	}
	// We expect the QR fields to be populated because we are providing a size
	phishUrlString := "http://example.com?email=foo%40bar.com&fname=Foo&lname=Bar&rid=1234567"
	expected := PhishingTemplateContext{
		URL:           phishUrlString,
		BaseURL:       ctx.URL,
		BaseRecipient: r.BaseRecipient,
		TrackingURL:   "http://example.com?rid=1234567",
		From:          "From Address",
		RId:           r.RId,
	}
	expected.Tracker = "<img alt='' style='display: none' src='" + expected.TrackingURL + "'/>"
	got, err := NewPhishingTemplateContext(ctx, r.BaseRecipient, r.RId)
	c.Assert(err, check.Equals, nil)

	// Since NewPhishingTemplateContext generates a random qrName AND
	c.Assert(got.URL != "", check.Equals, true)
	c.Assert(got.TrackingURL != "", check.Equals, true)
	c.Assert(got.QRName != "", check.Equals, true)
	c.Assert(got.QRBase64 != "", check.Equals, true)
	c.Assert(got.QR != "", check.Equals, true)

	expected.URL = got.URL
	expected.TrackingURL = got.TrackingURL
	expected.Tracker = got.Tracker
	expected.QRName = got.QRName
	expected.QRBase64 = got.QRBase64
	expected.QR = got.QR

	c.Assert(got, check.DeepEquals, expected)
}
