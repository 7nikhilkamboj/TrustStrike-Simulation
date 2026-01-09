package smser

import (
	"github.com/twilio/twilio-go"
	openapi "github.com/twilio/twilio-go/rest/api/v2010"
)

// TwilioMessage is a struct that holds the twilio client and parameters
// needed to send an SMS
type TwilioMessage struct {
	Client twilio.RestClient
	Params openapi.CreateMessageParams
}
