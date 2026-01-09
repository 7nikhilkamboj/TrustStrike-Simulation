package models

import (
	"encoding/base64"
	"strings"
	"testing"
)

// TestTrackingOnlyUrlGeneration verifies that the Phishing Template Context correctly
// generates the Lure URL with the appended 'rd' parameter when 'Tracking only' is selected.
func TestTrackingOnlyUrlGeneration(t *testing.T) {
	// 1. Setup Campaign
	c := &Campaign{
		Name:            "Test Tracking Campaign",
		URL:             "https://lure.server.com/test",
		AttackObjective: "Tracking only",
		RedirectURL:     "https://target.com/login",
		SMTP:            SMTP{FromAddress: "sender@example.com"},
	}

	// 2. Setup Recipient
	recipient := BaseRecipient{
		Email:     "user@example.com",
		FirstName: "John",
		LastName:  "Doe",
	}
	rid := "12345678"

	// 3. Generate Context
	ctx, err := NewPhishingTemplateContext(c, recipient, rid)
	if err != nil {
		t.Fatalf("Failed to generate context: %v", err)
	}

	// 4. Verify URL
	generatedURL := ctx.URL
	t.Logf("Generated URL: %s", generatedURL)

	// Check 1: Base URL presence
	if !strings.HasPrefix(generatedURL, c.URL) {
		t.Errorf("Expected URL to start with %s, got %s", c.URL, generatedURL)
	}

	// Check 2: 'rd' Parameter presence
	if !strings.Contains(generatedURL, "rd=") {
		t.Error("Expected URL to contain 'rd' parameter")
	}

	// Check 3: Correct Encoding (0 + Base64)
	encodedRedirect := "0" + base64.RawURLEncoding.EncodeToString([]byte(c.RedirectURL))
	expectedParam := "rd=" + encodedRedirect
	if !strings.Contains(generatedURL, expectedParam) {
		t.Errorf("Expected URL to contain param '%s', got '%s'", expectedParam, generatedURL)
	}
}

// TestTrackingOnlyMissingRedirect verifies behavior when RedirectURL is empty
func TestTrackingOnlyMissingRedirect(t *testing.T) {
	c := &Campaign{
		Name:            "Test No Redirect",
		URL:             "https://lure.server.com/test",
		AttackObjective: "Tracking only",
		RedirectURL:     "",
		SMTP:            SMTP{FromAddress: "sender@example.com"},
	}
	recipient := BaseRecipient{Email: "user@example.com"}
	ctx, err := NewPhishingTemplateContext(c, recipient, "123")
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	if strings.Contains(ctx.URL, "rd=") {
		t.Error("Should not contain 'rd' parameter if RedirectURL is empty")
	}
}

// TestSessionHijacking验证 verifies that 'rd' is NOT added for other modes
func TestSessionHijackingMode(t *testing.T) {
	c := &Campaign{
		Name:            "Test Hijacking",
		URL:             "https://lure.server.com/test",
		AttackObjective: "Session hijacking",
		RedirectURL:     "https://should-ignore.com",
		SMTP:            SMTP{FromAddress: "sender@example.com"},
	}
	recipient := BaseRecipient{Email: "user@example.com"}
	ctx, err := NewPhishingTemplateContext(c, recipient, "123")
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	if strings.Contains(ctx.URL, "rd=") {
		t.Error("Should not contain 'rd' parameter for Session hijacking mode, even if RedirectURL is populated")
	}
}
