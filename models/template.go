package models

import (
	"errors"
	"net/mail"
	"time"

	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	"github.com/jinzhu/gorm"
)

// Template models hold the attributes for an email template to be sent to targets
type Template struct {
	Id             int64        `json:"id" gorm:"column:id; primary_key:yes"`
	UserId         int64        `json:"-" gorm:"column:user_id"`
	Type           string       `json:"type" gorm:"column:type"`
	Name           string       `json:"name"`
	EnvelopeSender string       `json:"envelope_sender"`
	Subject        string       `json:"subject"`
	Text           string       `json:"text"`
	HTML           string       `json:"html" gorm:"column:html"`
	ModifiedDate   time.Time    `json:"modified_date"`
	Attachments    []Attachment `json:"attachments"`
	CreatedBy      string       `json:"created_by" sql:"-"`
}

// ErrTemplateNameNotSpecified is thrown when a template name is not specified
var ErrTemplateNameNotSpecified = errors.New("Template name not specified")

// ErrTemplateMissingParameter is thrown when a needed parameter is not provided
var ErrTemplateMissingParameter = errors.New("Need to specify at least plaintext or HTML content")

// Validate checks the given template to make sure values are appropriate and complete
func (t *Template) Validate() error {
	switch {
	case t.Name == "":
		return ErrTemplateNameNotSpecified
	case t.Text == "" && t.HTML == "":
		return ErrTemplateMissingParameter
	case t.EnvelopeSender != "":
		_, err := mail.ParseAddress(t.EnvelopeSender)
		if err != nil {
			return err
		}
	}
	if err := ValidateTemplate(t.HTML); err != nil {
		return err
	}
	if err := ValidateTemplate(t.Text); err != nil {
		return err
	}
	for _, a := range t.Attachments {
		if err := a.Validate(); err != nil {
			return err
		}
	}

	return nil
}

// GetTemplates returns the templates owned by the given user.
func GetTemplates(uid int64) ([]Template, error) {
	ts := []Template{}
	query := db.Model(&Template{})
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return ts, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	query = query.Select("templates.*, users.username as created_by").Joins("left join users on templates.user_id = users.id")
	err := query.Find(&ts).Error
	if err != nil {
		log.Error(err)
		return ts, err
	}
	for i := range ts {
		// Get Attachments
		err = db.Where("template_id=?", ts[i].Id).Find(&ts[i].Attachments).Error
		if err == nil && len(ts[i].Attachments) == 0 {
			ts[i].Attachments = make([]Attachment, 0)
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			log.Error(err)
			return ts, err
		}
	}
	return ts, err
}

// GetTemplate returns the template, if it exists, specified by the given id and user_id.
func GetTemplate(id int64, uid int64) (Template, error) {
	t := Template{}
	query := db.Where("id=?", id)
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return t, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	err := query.Find(&t).Error
	if err != nil {
		log.Error(err)
		return t, err
	}

	// Get Attachments
	err = db.Where("template_id=?", t.Id).Find(&t.Attachments).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Error(err)
		return t, err
	}
	if err == nil && len(t.Attachments) == 0 {
		t.Attachments = make([]Attachment, 0)
	}
	return t, err
}

// GetTemplateByName returns the template, if it exists, specified by the given name and user_id.
func GetTemplateByName(n string, uid int64) (Template, error) {
	t := Template{}
	query := db.Where("name=?", n)
	if uid != 0 {
		uids, err := GetUsersSharingWith(uid)
		if err != nil {
			return t, err
		}
		query = query.Where("user_id IN (?)", uids)
	}
	err := query.Find(&t).Error
	if err != nil {
		log.Error(err)
		return t, err
	}

	// Get Attachments
	err = db.Where("template_id=?", t.Id).Find(&t.Attachments).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Error(err)
		return t, err
	}
	if err == nil && len(t.Attachments) == 0 {
		t.Attachments = make([]Attachment, 0)
	}
	return t, err
}

// PostTemplate creates a new template in the database.
func PostTemplate(t *Template) error {
	// Insert into the DB
	if err := t.Validate(); err != nil {
		return err
	}
	err := db.Save(t).Error
	if err != nil {
		log.Error(err)
		return err
	}

	// Save every attachment
	for i := range t.Attachments {
		t.Attachments[i].TemplateId = t.Id
		err := db.Save(&t.Attachments[i]).Error
		if err != nil {
			log.Error(err)
			return err
		}
	}
	return nil
}

// PutTemplate edits an existing template in the database.
// Per the PUT Method RFC, it presumes all data for a template is provided.
func PutTemplate(t *Template) error {
	// Verify that the user has permission to modify this template
	existing, err := GetTemplate(t.Id, t.UserId)
	if err != nil {
		return err
	}
	// If the user is not an admin and the template belongs to the admin, deny update
	if t.UserId != 1 && existing.UserId == 1 {
		return errors.New("Only administrators can edit this resource. Please contact the admin.")
	}

	if err := t.Validate(); err != nil {
		return err
	}
	// Delete all attachments, and replace with new ones
	err = db.Where("template_id=?", t.Id).Delete(&Attachment{}).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Error(err)
		return err
	}
	if err == gorm.ErrRecordNotFound {
		err = nil
	}
	for i := range t.Attachments {
		t.Attachments[i].TemplateId = t.Id
		err = db.Save(&t.Attachments[i]).Error
		if err != nil {
			log.Error(err)
			return err
		}
	}

	// Save final template
	err = db.Where("id=?", t.Id).Save(t).Error
	if err != nil {
		log.Error(err)
		return err
	}
	return nil
}

// DeleteTemplate deletes an existing template in the database.
// An error is returned if a template with the given user id and template id is not found.
func DeleteTemplate(id int64, uid int64) error {
	// Verify that the user has permission to delete this template
	t, err := GetTemplate(id, uid)
	if err != nil {
		return err
	}
	// If the user is not an admin and the template belongs to the admin, deny deletion
	if uid != 1 && t.UserId == 1 {
		return errors.New("Only administrators can delete this resource. Please contact the admin.")
	}
	// Delete attachments
	err = db.Where("template_id=?", id).Delete(&Attachment{}).Error
	if err != nil {
		log.Error(err)
		return err
	}

	// Finally, delete the template itself
	err = db.Delete(Template{Id: id}).Error
	if err != nil {
		log.Error(err)
		return err
	}
	return nil
}
