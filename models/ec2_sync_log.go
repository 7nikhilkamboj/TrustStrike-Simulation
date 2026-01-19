package models

import (
	"time"
)

// EC2SyncLog tracks the last time EC2 was synced or started for a specific purpose
type EC2SyncLog struct {
	ID         int64     `json:"id" gorm:"primary_key;auto_increment"`
	SyncType   string    `json:"sync_type" gorm:"not null;unique"`
	LastSyncAt time.Time `json:"last_sync_at" gorm:"not null"`
	Status     string    `json:"status" gorm:"not null;default:'success'"`
}

// TableName sets the insert table name for this struct
func (EC2SyncLog) TableName() string {
	return "ec2_sync_log"
}

// GetLastEC2Sync returns the last sync time for a given type
func GetLastEC2Sync(syncType string) (time.Time, error) {
	var log EC2SyncLog
	err := db.Where("sync_type = ?", syncType).First(&log).Error
	if err != nil {
		return time.Time{}, err
	}
	return log.LastSyncAt, nil
}

// UpdateEC2Sync updates the last sync time for a given type
func UpdateEC2Sync(syncType string, status string) error {
	var log EC2SyncLog
	err := db.Where("sync_type = ?", syncType).First(&log).Error
	
	if err != nil {
		// Record doesn't exist, create new
		log = EC2SyncLog{
			SyncType:   syncType,
			LastSyncAt: time.Now().UTC(),
			Status:     status,
		}
		return db.Create(&log).Error
	}
	
	// Record exists, update it
	log.LastSyncAt = time.Now().UTC()
	log.Status = status
	return db.Save(&log).Error
}

// IsEC2SyncAllowed checks if a sync is allowed based on a 24-hour throttle
func IsEC2SyncAllowed(syncType string) (bool, error) {
	lastSync, err := GetLastEC2Sync(syncType)
	if err != nil {
		// If error (like record not found), assume it's allowed
		return true, nil
	}
	
	// Check if 24 hours have passed
	return time.Since(lastSync) >= 24*time.Hour, nil
}
