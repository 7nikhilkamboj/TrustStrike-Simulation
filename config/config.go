package config

import (
	"encoding/json"
	"io/ioutil"

	log "github.com/trust_strike/trust_strike/logger"
)

// AdminServer represents the Admin server configuration details
type AdminServer struct {
	ListenURL            string   `json:"listen_url"`
	UseTLS               bool     `json:"use_tls"`
	CertPath             string   `json:"cert_path"`
	KeyPath              string   `json:"key_path"`
	CSRFKey              string   `json:"csrf_key"`
	AllowedInternalHosts []string `json:"allowed_internal_hosts"`
	TrustedOrigins       []string `json:"trusted_origins"`
}

// PhishServer represents the Phish server configuration details
type PhishServer struct {
	ListenURL string `json:"listen_url"`
	UseTLS    bool   `json:"use_tls"`
	CertPath  string `json:"cert_path"`
	KeyPath   string `json:"key_path"`
}

// EC2Config represents the AWS EC2 configuration details
type EC2Config struct {
	AWSAccessKeyID     string `json:"aws_access_key_id"`
	AWSSecretAccessKey string `json:"aws_secret_access_key"`
	AWSRegion          string `json:"aws_region"`
	InstanceID         string `json:"instance_id"`
	SSHUser            string `json:"ssh_user"`
	SSHKeyPath         string `json:"ssh_key_path"`
	RemoteDir          string `json:"remote_dir"`
	ScreenName         string `json:"screen_name"`
}

// Config represents the configuration information.
type Config struct {
	AdminConf           AdminServer `json:"admin_server"`
	PhishConf           PhishServer `json:"phish_server"`
	DBName              string      `json:"db_name"`
	DBPath              string      `json:"db_path"`
	DBSSLCaPath         string      `json:"db_sslca_path"`
	MigrationsPath      string      `json:"migrations_prefix"`
	TestFlag            bool        `json:"test_flag"`
	ContactAddress      string      `json:"contact_address"`
	Logging             *log.Config `json:"logging"`
	Keycloak            Keycloak    `json:"keycloak"`
	SimulationPath      string      `json:"simulation_path"`
	SimulationServerURL string      `json:"simulation_server_url"`
	EC2                 EC2Config   `json:"ec2"`
}

// Keycloak represents the Keycloak configuration details
type Keycloak struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	DiscoveryURL string `json:"discovery_url"`
	RedirectURL  string `json:"redirect_url"`
}

// Version contains the current trust_strike version
var Version = ""

// ServerName is the server type that is returned in the transparency response.
const ServerName = "IGNORE"

// LoadConfig loads the configuration from the specified filepath
func LoadConfig(filepath string) (*Config, error) {
	// Get the config file
	configFile, err := ioutil.ReadFile(filepath)
	if err != nil {
		return nil, err
	}
	config := &Config{}
	err = json.Unmarshal(configFile, config)
	if err != nil {
		return nil, err
	}
	if config.Logging == nil {
		config.Logging = &log.Config{}
	}
	// Choosing the migrations directory based on the database used.
	config.MigrationsPath = config.MigrationsPath + config.DBName
	// Explicitly set the TestFlag to false to prevent config.json overrides
	config.TestFlag = false
	return config, nil
}
