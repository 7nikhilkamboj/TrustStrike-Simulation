package models

import (
	"time"
)

// BlacklistedToken represents a JWT token that has been invalidated (e.g., on logout)
type BlacklistedToken struct {
	Id        int64     `json:"id" gorm:"primaryKey;autoIncrement"`
	Token     string    `json:"token" gorm:"uniqueIndex"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// BlacklistToken adds a token to the blacklist
func BlacklistToken(token string, expiresAt time.Time) error {
	bt := BlacklistedToken{
		Token:     token,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now().UTC(),
	}
	return db.Create(&bt).Error
}

// IsTokenBlacklisted checks if a token has been blacklisted
func IsTokenBlacklisted(token string) bool {
	var count int64
	db.Model(&BlacklistedToken{}).Where("token = ?", token).Count(&count)
	return count > 0
}

// CleanupExpiredBlacklistedTokens removes expired tokens from the blacklist
func CleanupExpiredBlacklistedTokens() error {
	return db.Where("expires_at < ?", time.Now().UTC()).Delete(&BlacklistedToken{}).Error
}
