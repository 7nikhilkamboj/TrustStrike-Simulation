package models

import (
	"time"
)

// TemplateCache stores cached template data from the simulation server
type TemplateCache struct {
	ID        int64     `json:"id" gorm:"primary_key;auto_increment"`
	CacheType string    `json:"cache_type" gorm:"not null"`
	CacheKey  string    `json:"cache_key" gorm:"not null;default:''"`
	Data      string    `json:"data" gorm:"type:text;not null"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName returns the table name for GORM
func (TemplateCache) TableName() string {
	return "template_cache"
}

// GetCache retrieves cached data for a given cache type and key
func GetCache(cacheType, cacheKey string) (string, error) {
	var cache TemplateCache
	err := db.Where("cache_type = ? AND cache_key = ?", cacheType, cacheKey).First(&cache).Error
	if err != nil {
		return "", err
	}
	return cache.Data, nil
}

// SetCache stores or updates cached data for a given cache type and key
func SetCache(cacheType, cacheKey, data string) error {
	var cache TemplateCache
	err := db.Where("cache_type = ? AND cache_key = ?", cacheType, cacheKey).First(&cache).Error
	
	if err != nil {
		// Record doesn't exist, create new
		cache = TemplateCache{
			CacheType: cacheType,
			CacheKey:  cacheKey,
			Data:      data,
			UpdatedAt: time.Now().UTC(),
		}
		return db.Create(&cache).Error
	}
	
	// Record exists, update it
	cache.Data = data
	cache.UpdatedAt = time.Now().UTC()
	return db.Save(&cache).Error
}

// DeleteCache removes cached data for a given cache type and key
func DeleteCache(cacheType, cacheKey string) error {
	return db.Where("cache_type = ? AND cache_key = ?", cacheType, cacheKey).Delete(&TemplateCache{}).Error
}

// DeleteCacheByType removes all cached data for a given cache type
func DeleteCacheByType(cacheType string) error {
	return db.Where("cache_type = ?", cacheType).Delete(&TemplateCache{}).Error
}
