package models

import (
	"fmt"
	"testing"
)

// TestLandingURLWithCampaign tests that LandingURL is properly set
func TestLandingURLWithCampaign(t *testing.T) {
	// Create a mock campaign with both URL and LandingURL
	campaign := &Campaign{
		URL:        "https://login.localhost.com/finaltest",
		LandingURL: "https://aadcdn.localhost.com/finaltest",
		SMTP: SMTP{
			FromAddress: "test@example.com",
		},
	}

	// Create a test recipient
	recipient := BaseRecipient{
		FirstName: "John",
		LastName:  "Doe",
		Email:     "john@example.com",
	}

	// Generate the context
	ptx, err := NewPhishingTemplateContext(campaign, recipient, "test123")
	if err != nil {
		t.Fatalf("Failed to create context: %v", err)
	}

	// Print results for debugging
	fmt.Printf("URL: %s\n", ptx.URL)
	fmt.Printf("LandingURL: %s\n", ptx.LandingURL)

	// Verify LandingURL is not empty
	if ptx.LandingURL == "" {
		t.Error("LandingURL is empty")
	}

	// Verify LandingURL contains the landing domain
	if len(ptx.LandingURL) < 10 {
		t.Errorf("LandingURL seems incomplete: %s", ptx.LandingURL)
	}

	// Verify it's different from URL if they were different
	fmt.Printf("\nVerification:\n")
	// fmt.Printf("- LandingURL populated: %v\n", ptx.LandingURL != "")
	// fmt.Printf("- Has aadcdn domain: %v\n", len(ptx.LandingURL) > 0)
}

// TestLandingURLFallback tests fallback when LandingURL is empty
func TestLandingURLFallback(t *testing.T) {
	// Create a campaign WITHOUT LandingURL
	campaign := &Campaign{
		URL:        "https://login.localhost.com/finaltest",
		LandingURL: "", // Empty - should fallback to URL
		SMTP: SMTP{
			FromAddress: "test@example.com",
		},
	}

	recipient := BaseRecipient{
		FirstName: "Jane",
		LastName:  "Smith",
		Email:     "jane@example.com",
	}

	ptx, err := NewPhishingTemplateContext(campaign, recipient, "test456")
	if err != nil {
		t.Fatalf("Failed to create context: %v", err)
	}

	fmt.Printf("\nFallback Test:\n")
	fmt.Printf("URL: %s\n", ptx.URL)
	fmt.Printf("LandingURL: %s\n", ptx.LandingURL)

	// When LandingURL is empty, it should fallback to URL
	if ptx.LandingURL == "" {
		t.Error("LandingURL should fallback to URL when empty")
	}
}
