package models

import (
	"errors"
	"time"

	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
)

// SMS contains the attributes needed to handle the sending of campaign SMS messages
type SMS struct {
	Id               int64     `json:"id" gorm:"column:id; primary_key:yes"`
	UserId           int64     `json:"-" gorm:"column:user_id"`
	Name             string    `json:"name"`
	InterfaceType    string    `json:"interface_type" gorm:"column:interface_type"`
	TwilioAccountSid string    `json:"account_sid"`
	TwilioAuthToken  string    `json:"auth_token"`
	SMSFrom          string    `json:"sms_from"`
	ModifiedDate     time.Time `json:"modified_date"`
	CreatedBy        string    `json:"created_by" sql:"-"`
}

var ErrAccountSidNotSpecified = errors.New("No Twilio Account SID Specified")
var ErrAuthTokenNotSpecified = errors.New("No Twilio Auth Token Specified")

func (s *SMS) Validate() error {
	if s.Name == "" {
		return errors.New("SMS Profile Name not specified")
	}
	if s.TwilioAccountSid == "" {
		return ErrAccountSidNotSpecified
	}
	if s.TwilioAuthToken == "" {
		return ErrAuthTokenNotSpecified
	}
	if s.SMSFrom == "" {
		return errors.New("SMS From Number not specified")
	}
	return nil
}

// TableName specifies the database tablename for Gorm to use
func (s SMS) TableName() string {
	return "sms"
}

// GetSMSs returns the SMSs owned by the given user.
func GetSMSs(uid int64) ([]SMS, error) {
	ss := []SMS{}
	query := db.Model(&SMS{})
	if uid != 0 {
		query = query.Where("user_id = ?", uid)
	}
	query = query.Select("sms.*, users.username as created_by").Joins("left join users on sms.user_id = users.id")
	err := query.Find(&ss).Error
	if err != nil {
		log.Error(err)
		return ss, err
	}

	return ss, nil
}

// GetSMS returns the SMS, if it exists, specified by the given id and user_id.
func GetSMS(id int64, uid int64) (SMS, error) {
	s := SMS{}
	query := db.Where("id=?", id)
	if uid != 0 {
		query = query.Where("user_id=?", uid)
	}
	err := query.Find(&s).Error
	if err != nil {
		log.Error(err)
		return s, err
	}

	return s, err
}

// GetSMSByName returns the SMS, if it exists, specified by the given name and user_id.
func GetSMSByName(n string, uid int64) (SMS, error) {
	s := SMS{}
	query := db.Where("name=? AND user_id=?", n, uid)
	err := query.Find(&s).Error
	if err != nil {
		log.Error(err)
		return s, err
	}
	return s, err
}

func PostSMS(s *SMS) error {
	if s.InterfaceType == "" {
		s.InterfaceType = "SMS"
	}
	err := s.Validate()
	if err != nil {
		log.Error(err)
		return err
	}
	// Insert into the DB
	err = db.Save(s).Error
	if err != nil {
		log.Error(err)
	}

	return err
}

func PutSMS(s *SMS) error {
	// Verify that the user has permission to modify this SMS profile
	existing, err := GetSMS(s.Id, s.UserId)
	if err != nil {
		return err
	}
	// If the user is not an admin and the profile belongs to the admin, deny update
	if s.UserId != 1 && existing.UserId == 1 {
		return errors.New("Only administrators can edit this resource. Please contact the admin.")
	}

	if s.InterfaceType == "" {
		s.InterfaceType = "SMS"
	}
	err = s.Validate()
	if err != nil {
		log.Error(err)
		return err
	}
	err = db.Where("id=?", s.Id).Save(s).Error
	if err != nil {
		log.Error(err)
	}

	return err
}

func DeleteSMS(id int64, uid int64) error {
	// Fetch the SMS to check ownership
	s, err := GetSMS(id, uid)
	if err != nil {
		return err
	}
	// If the user is not an admin and the profile belongs to the admin, deny deletion
	// uid == 0 indicates an admin action (e.g., from DeleteUser cascade)
	if uid != 0 && uid != 1 && s.UserId == 1 {
		return errors.New("Only administrators can delete this resource. Please contact the admin.")
	}
	err = db.Delete(SMS{Id: id}).Error
	if err != nil {
		log.Error(err)
	}
	return err
}
