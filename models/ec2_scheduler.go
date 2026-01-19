package models

import (
	"time"
)

const (
	// ConfigKeyEC2StartTime is the key used in simulation_config to store EC2 start time
	ConfigKeyEC2StartTime = "ec2_start_time"
)

// SetEC2StartTime records the current time as the EC2 start time in the simulation_config table
func SetEC2StartTime(t time.Time) error {
	return SetSimulationConfig(ConfigKeyEC2StartTime, t.Format(time.RFC3339))
}

// GetEC2StartTime retrieves the EC2 start time from the simulation_config table
func GetEC2StartTime() (time.Time, error) {
	val, err := GetSimulationConfig(ConfigKeyEC2StartTime)
	if err != nil {
		return time.Time{}, err
	}
	if val == "" {
		return time.Time{}, nil
	}
	return time.Parse(time.RFC3339, val)
}

// HasActiveCampaigns checks if there are any campaigns currently "In progress"
func HasActiveCampaigns() (bool, error) {
	var count int64
	// Check standard campaigns
	err := db.Table("campaigns").Where("status = ?", CampaignInProgress).Count(&count).Error
	if err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Double check SMS campaigns if they are separate, though usually they share the same table
	// and Status constant. Based on models/campaign.go, it seems they do.
	
	return false, nil
}
