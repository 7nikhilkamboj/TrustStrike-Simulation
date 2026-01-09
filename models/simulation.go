package models

import (
	"github.com/jinzhu/gorm"
	log "github.com/trust_strike/trust_strike/logger"
)

// SimulationConfig represents a configuration setting for the simulation server
type SimulationConfig struct {
	Id    int64  `json:"id" gorm:"column:id; primary_key:yes"`
	Key   string `json:"key" gorm:"unique;not null"`
	Value string `json:"value"`
}

// GetSimulationConfig retrieves a configuration value by key from the database
func GetSimulationConfig(key string) (string, error) {
	var conf SimulationConfig
	err := db.Where("key = ?", key).First(&conf).Error
	if err == gorm.ErrRecordNotFound {
		return "", nil
	}
	return conf.Value, err
}

// SetSimulationConfig saves or updates a configuration value by key in the database
func SetSimulationConfig(key string, value string) error {
	var conf SimulationConfig
	err := db.Where("key = ?", key).First(&conf).Error
	if err == gorm.ErrRecordNotFound {
		conf = SimulationConfig{
			Key:   key,
			Value: value,
		}
	} else if err == nil {
		conf.Value = value
	} else {
		log.Error(err)
		return err
	}
	err = db.Save(&conf).Error
	if err != nil {
		log.Error(err)
	}
	return err
}
