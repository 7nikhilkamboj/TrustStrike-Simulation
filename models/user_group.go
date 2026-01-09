package models

import (
	"time"

	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
)

// UserGroup represents a group of users that share access to objects.
type UserGroup struct {
	ID           int64     `json:"id" gorm:"primary_key"`
	Name         string    `json:"name" sql:"not null;unique"`
	ModifiedDate time.Time `json:"modified_date"`
	Members      []User    `json:"members" gorm:"-"`
}

// UserGroupMembership represents a user's membership in a UserGroup.
type UserGroupMembership struct {
	UserID      int64 `gorm:"primary_key;auto_increment:false"`
	UserGroupID int64 `gorm:"primary_key;auto_increment:false"`
}

// GetUserGroups returns all user groups.
func GetUserGroups() ([]UserGroup, error) {
	gs := []UserGroup{}
	err := db.Find(&gs).Error
	return gs, err
}

// GetUserGroup returns the user group with the given ID.
func GetUserGroup(id int64) (UserGroup, error) {
	g := UserGroup{}
	err := db.Where("id=?", id).First(&g).Error
	if err != nil {
		return g, err
	}
	// Fetch members
	members := []User{}
	err = db.Table("users").
		Joins("JOIN user_group_memberships ON user_group_memberships.user_id = users.id").
		Where("user_group_memberships.user_group_id = ?", id).
		Find(&members).Error
	g.Members = members
	return g, err
}

// PostUserGroup creates a new user group.
func PostUserGroup(g *UserGroup) error {
	g.ModifiedDate = time.Now().UTC()
	return db.Create(g).Error
}

// DeleteUserGroup deletes a user group and all associated memberships.
func DeleteUserGroup(id int64) error {
	tx := db.Begin()
	err := tx.Where("user_group_id=?", id).Delete(&UserGroupMembership{}).Error
	if err != nil {
		tx.Rollback()
		return err
	}
	err = tx.Where("id=?", id).Delete(&UserGroup{}).Error
	if err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

// AddUserToGroup adds a user to a user group.
func AddUserToGroup(uid int64, gid int64) error {
	m := UserGroupMembership{UserID: uid, UserGroupID: gid}
	return db.Save(&m).Error
}

// RemoveUserFromGroup removes a user from a user group.
func RemoveUserFromGroup(uid int64, gid int64) error {
	return db.Where("user_id=? AND user_group_id=?", uid, gid).Delete(&UserGroupMembership{}).Error
}

// SetUserGroups sets the user's groups to the provided list of group IDs.
func SetUserGroups(uid int64, gids []int64) error {
	log.Debugf("Setting User Groups for UID %d: %v", uid, gids)
	tx := db.Begin()
	err := tx.Where("user_id=?", uid).Delete(&UserGroupMembership{}).Error
	if err != nil {
		log.Errorf("Error deleting old group memberships: %v", err)
		tx.Rollback()
		return err
	}
	for _, gid := range gids {
		log.Debugf("Adding user %d to group %d", uid, gid)
		m := UserGroupMembership{UserID: uid, UserGroupID: gid}
		err = tx.Create(&m).Error
		if err != nil {
			log.Errorf("Error saving group membership: %v", err)
			tx.Rollback()
			return err
		}
	}
	return tx.Commit().Error
}

// GetUsersSharingWith returns a list of user IDs that are in the same groups as the given user.
func GetUsersSharingWith(uid int64) ([]int64, error) {
	if uid == 0 {
		return nil, nil
	}

	// Fetch the user to check their role
	u, err := GetUser(uid)
	if err != nil {
		return nil, err
	}

	// If the user is an admin, they should see everything
	if u.Role.Slug == RoleAdmin || uid == 1 {
		uids := []int64{}
		err = db.Model(&User{}).Pluck("id", &uids).Error
		return uids, err
	}

	// Find all group IDs the user belongs to
	gids := []int64{}
	err = db.Model(&UserGroupMembership{}).Where("user_id=?", uid).Pluck("user_group_id", &gids).Error
	if err != nil {
		return nil, err
	}

	// Find all users in those groups
	uids := []int64{}
	if len(gids) > 0 {
		err = db.Model(&UserGroupMembership{}).Where("user_group_id IN (?)", gids).Pluck("user_id", &uids).Error
		if err != nil {
			return nil, err
		}
	}

	// Ensure the original user and admin (1) are included.
	uniqueUIDs := make(map[int64]bool)
	uniqueUIDs[uid] = true
	uniqueUIDs[1] = true // Include admin-owned resources
	for _, id := range uids {
		uniqueUIDs[id] = true
	}

	result := make([]int64, 0, len(uniqueUIDs))
	for id := range uniqueUIDs {
		result = append(result, id)
	}

	return result, nil
}
