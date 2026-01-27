package models

import (
	"errors"
	"fmt"
	"net/mail"
	"time"

	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	"github.com/jinzhu/gorm"
	"github.com/sirupsen/logrus"
)

// Group contains the fields needed for a user -> group mapping
// Groups contain 1..* Targets
type Group struct {
	Id           int64     `json:"id"`
	UserId       int64     `json:"-"`
	Name         string    `json:"name" gorm:"column:name"`
	GroupType    string    `json:"group_type" gorm:"column:group_type"`
	ModifiedDate time.Time `json:"modified_date" gorm:"column:modified_date"`
	Targets      []Target  `json:"targets" sql:"-"`
	CreatedBy    string    `json:"created_by" sql:"-"`
	IsActive     bool      `json:"is_active" gorm:"column:is_active;default:true"`
}

// GroupSummaries is a struct representing the overview of Groups.
type GroupSummaries struct {
	Total  int64          `json:"total"`
	Groups []GroupSummary `json:"groups"`
}

// GroupSummary represents a summary of the Group model. The only
// difference is that, instead of listing the Targets (which could be expensive
// for large groups), it lists the target count.
type GroupSummary struct {
	Id           int64     `json:"id" gorm:"column:id"`
	Name         string    `json:"name" gorm:"column:name"`
	GroupType    string    `json:"group_type" gorm:"column:group_type"`
	ModifiedDate time.Time `json:"modified_date" gorm:"column:modified_date"`
	NumTargets   int64     `json:"num_targets" gorm:"-"`
	CreatedBy    string    `json:"created_by" gorm:"->;column:created_by"`
}

// GroupTarget is used for a many-to-many relationship between 1..* Groups and 1..* Targets
type GroupTarget struct {
	GroupId  int64 `json:"-"`
	TargetId int64 `json:"-"`
}

// Target contains the fields needed for individual targets specified by the user
// Groups contain 1..* Targets, but 1 Target may belong to 1..* Groups
type Target struct {
	Id int64 `json:"-"`
	BaseRecipient
}

// BaseRecipient contains the fields for a single recipient. This is the base
// struct used in members of groups and campaign results.
type BaseRecipient struct {
	Email     string `json:"email"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Position  string `json:"position"`
}

// FormatAddress returns the email address to use in the "To" header of the email
func (r *BaseRecipient) FormatAddress() string {
	addr := r.Email
	if r.FirstName != "" && r.LastName != "" {
		a := &mail.Address{
			Name:    fmt.Sprintf("%s %s", r.FirstName, r.LastName),
			Address: r.Email,
		}
		addr = a.String()
	}
	return addr
}

// FormatAddress returns the email address to use in the "To" header of the email
func (t *Target) FormatAddress() string {
	addr := t.Email
	if t.FirstName != "" && t.LastName != "" {
		a := &mail.Address{
			Name:    fmt.Sprintf("%s %s", t.FirstName, t.LastName),
			Address: t.Email,
		}
		addr = a.String()
	}
	return addr
}

// ErrEmailNotSpecified is thrown when no email is specified for the Target
var ErrEmailNotSpecified = errors.New("No email address specified")

// ErrGroupNameNotSpecified is thrown when a group name is not specified
var ErrGroupNameNotSpecified = errors.New("Group name not specified")

// ErrNoTargetsSpecified is thrown when no targets are specified by the user
var ErrNoTargetsSpecified = errors.New("No targets specified")

// Validate performs validation on a group given by the user
func (g *Group) Validate() error {
	switch {
	case g.Name == "":
		return ErrGroupNameNotSpecified
	case len(g.Targets) == 0:
		return ErrNoTargetsSpecified
	}
	return nil
}

// GetGroups returns the groups owned by the given user.
func GetGroups(uid int64) ([]Group, error) {
	gs := []Group{}
	query := db.Model(&Group{})
	query = query.Where("is_active IS NOT ?", false)
	err := query.Find(&gs).Error
	if err != nil {
		log.Error(err)
		return gs, err
	}
	for i := range gs {
		gs[i].Targets, err = GetTargets(gs[i].Id)
		if err != nil {
			log.Error(err)
		}
	}
	return gs, nil
}

// GetGroupSummaries returns the summaries for the groups
// created by the given uid.
func GetGroupSummaries(uid int64) (GroupSummaries, error) {
	gs := GroupSummaries{}
	query := db.Table("groups")
	query = query.Where("is_active IS NOT ?", false)
	query = query.Select("groups.*, users.username as created_by").Joins("left join users on groups.user_id = users.id")
	err := query.Find(&gs.Groups).Error
	if err != nil {
		log.Error(err)
		return gs, err
	}
	for i := range gs.Groups {
		query = db.Table("group_targets").Where("group_id=?", gs.Groups[i].Id)
		err = query.Count(&gs.Groups[i].NumTargets).Error
	}
	query = query.Select("groups.*, users.username as created_by").Joins("left join users on groups.user_id = users.id")
	err = query.Find(&gs.Groups).Error
	if err != nil {
		log.Error(err)
		return gs, err
	}
	for i := range gs.Groups {
		query = db.Table("group_targets").Where("group_id=?", gs.Groups[i].Id)
		err = query.Count(&gs.Groups[i].NumTargets).Error
		if err != nil {
			return gs, err
		}
	}
	gs.Total = int64(len(gs.Groups))
	return gs, nil
}

// GetGroup returns the group, if it exists, specified by the given id and user_id.
func GetGroup(id int64, uid int64) (Group, error) {
	g := Group{}
	query := db.Where("id=?", id)
	err := query.Find(&g).Error
	if err != nil {
		log.Error(err)
		return g, err
	}
	g.Targets, err = GetTargets(g.Id)
	if err != nil {
		log.Error(err)
	}
	return g, nil
}

// GetGroupSummary returns the summary for the requested group
func GetGroupSummary(id int64, uid int64) (GroupSummary, error) {
	g := GroupSummary{}
	query := db.Table("groups").Where("id=?", id).Where("is_active IS NOT ?", false)
	err := query.Find(&g).Error
	if err != nil {
		log.Error(err)
		return g, err
	}
	query = db.Table("group_targets").Where("group_id=?", id)
	err = query.Count(&g.NumTargets).Error
	if err != nil {
		return g, err
	}
	return g, nil
}

// GetGroupByName returns the group, if it exists, specified by the given name and user_id.
func GetGroupByName(n string, uid int64) (Group, error) {
	g := Group{}
	query := db.Where("name=?", n)
	err := query.Find(&g).Error
	if err != nil {
		log.Error(err)
		return g, err
	}
	g.Targets, err = GetTargets(g.Id)
	if err != nil {
		log.Error(err)
	}
	return g, err
}

// PostGroup creates a new group in the database.
func PostGroup(g *Group) error {
	if err := g.Validate(); err != nil {
		return err
	}
	// Insert the group into the DB
	tx := db.Begin()
	err := tx.Save(g).Error
	if err != nil {
		tx.Rollback()
		log.Error(err)
		return err
	}
	for _, t := range g.Targets {
		_, _, err = insertTargetIntoGroup(tx, t, g.Id)
		if err != nil {
			tx.Rollback()
			log.Error(err)
			return err
		}
	}
	err = tx.Commit().Error
	if err != nil {
		log.Error(err)
		tx.Rollback()
		return err
	}
	return nil
}

// PutGroup updates the given group if found in the database.
func PutGroup(g *Group) error {
	// Verify that the user has permission to modify this group
	existing, err := GetGroup(g.Id, g.UserId)
	if err != nil {
		return err
	}
	// If the user is not an admin and the group belongs to the admin, deny update
	if g.UserId != 1 && existing.UserId == 1 {
		return errors.New("Only administrators can edit this resource. Please contact the admin.")
	}

	if err := g.Validate(); err != nil {
		return err
	}
	// Fetch group's existing targets from database.
	ts, err := GetTargets(g.Id)
	if err != nil {
		log.WithFields(logrus.Fields{
			"group_id": g.Id,
		}).Error("Error getting targets from group")
		return err
	}
	// Preload the caches
	cacheNew := make(map[string]int64, len(g.Targets))
	for _, t := range g.Targets {
		cacheNew[t.Email] = t.Id
	}

	cacheExisting := make(map[string]int64, len(ts))
	for _, t := range ts {
		cacheExisting[t.Email] = t.Id
	}

	tx := db.Begin()
	// Check existing targets, removing any that are no longer in the group.
	for _, t := range ts {
		if _, ok := cacheNew[t.Email]; ok {
			continue
		}

		// If the target does not exist in the group any longer, we delete it
		err := tx.Where("group_id=? and target_id=?", g.Id, t.Id).Delete(&GroupTarget{}).Error
		if err != nil {
			tx.Rollback()
			log.WithFields(logrus.Fields{
				"email": t.Email,
			}).Error("Error deleting email")
		}
	}
	// Add any targets that are not in the database yet.
	for _, nt := range g.Targets {
		// If the target already exists in the database, we should just update
		// the record with the latest information.
		if id, ok := cacheExisting[nt.Email]; ok {
			nt.Id = id
			err = UpdateTarget(tx, nt)
			if err != nil {
				log.Error(err)
				tx.Rollback()
				return err
			}
			continue
		}
		// Otherwise, add target if not in database
		_, _, err = insertTargetIntoGroup(tx, nt, g.Id)
		if err != nil {
			log.Error(err)
			tx.Rollback()
			return err
		}
	}
	err = tx.Save(g).Error
	if err != nil {
		log.Error(err)
		return err
	}
	err = tx.Commit().Error
	if err != nil {
		tx.Rollback()
		return err
	}
	return nil
}

// DeleteGroup deletes a given group by group ID and user ID
func DeleteGroup(id int64, uid int64) error {
	// Verify that the user has permission to delete this group
	g, err := GetGroup(id, uid)
	if err != nil {
		return err
	}
	// If the user is not an admin and the group belongs to the admin, deny deletion
	// (uid 0 is used for internal/system deletions like cleanup)
	if uid != 0 && uid != 1 && g.UserId == 1 {
		return errors.New("Only administrators can delete this resource. Please contact the admin.")
	}
	// Delete all the group_targets entries for this group
	err = db.Where("group_id=?", id).Delete(&GroupTarget{}).Error
	if err != nil {
		log.Error(err)
		return err
	}
	// Delete the group itself
	err = db.Delete(Group{Id: id}).Error
	if err != nil {
		log.Error(err)
		return err
	}
	return err
}

func insertTargetIntoGroup(tx *gorm.DB, t Target, gid int64) (int64, int64, error) {
	// If the email doesn't parse as an address, it might be a phone number for SMS.
	// We log it as a warning but don't block the request.
	if _, err := mail.ParseAddress(t.Email); err != nil {
		log.WithFields(logrus.Fields{
			"email": t.Email,
		}).Warn("Non-standard email address provided (could be an SMS phone number)")
	}
	var addedTargetID int64
	var linkedTargetID int64

	// Check if target exists
	existing := Target{}
	err := tx.Where("email = ?", t.Email).First(&existing).Error
	if err != nil && !gorm.IsRecordNotFoundError(err) {
		return 0, 0, err
	}

	if existing.Id == 0 {
		err = tx.Create(&t).Error
		if err != nil {
			log.WithFields(logrus.Fields{
				"email": t.Email,
			}).Error(err)
			return 0, 0, err
		}
		addedTargetID = t.Id
	} else {
		t = existing
	}

	// Check if already in group
	gt := GroupTarget{}
	err = tx.Where("group_id = ? AND target_id = ?", gid, t.Id).First(&gt).Error
	if err != nil && !gorm.IsRecordNotFoundError(err) {
		return addedTargetID, 0, err
	}

	if gt.TargetId == 0 {
		err = tx.Save(&GroupTarget{GroupId: gid, TargetId: t.Id}).Error
		if err != nil {
			log.WithFields(logrus.Fields{
				"email": t.Email,
			}).Error("Error adding many-many mapping")
			return addedTargetID, 0, err
		}
		linkedTargetID = t.Id
	}
	return addedTargetID, linkedTargetID, nil
}

// UpdateTarget updates the given target information in the database.
func UpdateTarget(tx *gorm.DB, target Target) error {
	targetInfo := map[string]interface{}{
		"first_name": target.FirstName,
		"last_name":  target.LastName,
		"position":   target.Position,
	}
	err := tx.Model(&target).Where("id = ?", target.Id).Updates(targetInfo).Error
	if err != nil {
		log.WithFields(logrus.Fields{
			"email": target.Email,
		}).Error("Error updating target information")
	}
	return err
}

// GetTargets performs a many-to-many select to get all the Targets for a Group
func GetTargets(gid int64) ([]Target, error) {
	ts := []Target{}
	err := db.Table("targets").Select("targets.id, targets.email, targets.first_name, targets.last_name, targets.position").Joins("left join group_targets gt ON targets.id = gt.target_id").Where("gt.group_id=?", gid).Scan(&ts).Error
	return ts, err
}

// CreateGroupShell creates a group entry without targets initially.
// Used for bulk import flows where targets are added asynchronously.
func CreateGroupShell(g *Group) error {
	if g.Name == "" {
		return ErrGroupNameNotSpecified
	}
	return db.Save(g).Error
}

// UpdateGroupFields updates specific fields for a group in the database.
func UpdateGroupFields(id int64, updates map[string]interface{}) error {
	return db.Model(&Group{}).Where("id = ?", id).Updates(updates).Error
}

// BulkInsertTargets inserts a list of targets into a group efficiently (in a single transaction).
// Returns added target IDs and linked target IDs for progress/cleanup tracking.
func BulkInsertTargets(gid int64, targets []Target) ([]int64, []int64, error) {
	tx := db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	addedTargets := []int64{}
	linkedTargets := []int64{}

	for _, t := range targets {
		atid, ltid, err := insertTargetIntoGroup(tx, t, gid)
		if err != nil {
			log.Error("Failed to insert target during bulk import: ", err)
			continue
		}
		if atid != 0 {
			addedTargets = append(addedTargets, atid)
		}
		if ltid != 0 {
			linkedTargets = append(linkedTargets, ltid)
		}
	}

	return addedTargets, linkedTargets, tx.Commit().Error
}

// CleanupImport removes the provided target and link IDs from the database.
// This is used when a background import is cancelled.
func CleanupImport(targetIDs []int64, groupID int64, linkedTargetIDs []int64) error {
	chunkSize := 500

	// Cleanup Links in chunks
	for i := 0; i < len(linkedTargetIDs); i += chunkSize {
		end := i + chunkSize
		if end > len(linkedTargetIDs) {
			end = len(linkedTargetIDs)
		}
		chunk := linkedTargetIDs[i:end]
		err := db.Where("group_id = ? AND target_id IN (?)", groupID, chunk).Delete(&GroupTarget{}).Error
		if err != nil {
			log.Errorf("Failed to cleanup links during cancel: %v", err)
		}
	}

	// Cleanup Targets in chunks
	for i := 0; i < len(targetIDs); i += chunkSize {
		end := i + chunkSize
		if end > len(targetIDs) {
			end = len(targetIDs)
		}
		chunk := targetIDs[i:end]
		err := db.Where("id IN (?)", chunk).Delete(&Target{}).Error
		if err != nil {
			log.Errorf("Failed to cleanup targets during cancel: %v", err)
		}
	}
	return nil
}
