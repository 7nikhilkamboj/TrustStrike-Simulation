package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/signal"

	"github.com/alecthomas/kingpin.v2"

	"github.com/7nikhilkamboj/TrustStrike-Simulation/config"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/controllers"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/dialer"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/imap"
	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/middleware"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/webhook"
)

const (
	modeAll   string = "all"
	modeAdmin string = "admin"
	modePhish string = "phish"
)

var (
	configPath    = kingpin.Flag("config", "Location of config.json.").Default("./config.json").String()
	disableMailer = kingpin.Flag("disable-mailer", "Disable the mailer (for use with multi-system deployments)").Bool()
	mode          = kingpin.Flag("mode", fmt.Sprintf("Run the binary in one of the modes (%s, %s or %s)", modeAll, modeAdmin, modePhish)).
			Default("all").Enum(modeAll, modeAdmin, modePhish)
)

func main() {
	// Load the version

	version, err := ioutil.ReadFile("./VERSION")
	if err != nil {
		log.Fatal(err)
	}
	kingpin.Version(string(version))

	// Parse the CLI flags and load the config
	kingpin.CommandLine.HelpFlag.Short('h')
	kingpin.Parse()

	// Load the config
	conf, err := config.LoadConfig(*configPath)
	// Just warn if a contact address hasn't been configured
	if err != nil {
		log.Fatal(err)
	}
	if conf.ContactAddress == "" {
		log.Warnf("No contact address has been configured.")
		log.Warnf("Please consider adding a contact_address entry in your config.json")
	}
	config.Version = string(version)

	// Configure our various upstream clients to make sure that we restrict
	// outbound connections as needed.
	dialer.SetAllowedHosts(conf.AdminConf.AllowedInternalHosts)
	webhook.SetTransport(&http.Transport{
		DialContext: dialer.Dialer().DialContext,
	})

	err = log.Setup(conf.Logging)
	if err != nil {
		log.Fatal(err)
	}

	// Provide the option to disable the built-in mailer
	// Setup the global variables and settings
	err = models.Setup(conf)
	if err != nil {
		log.Fatal(err)
	}

	// Unlock any maillogs that may have been locked for processing
	// when trust_strike was last shutdown.
	err = models.UnlockAllMailLogs()
	if err != nil {
		log.Fatal(err)
	}

	// Create our servers
	adminOptions := []controllers.AdminServerOption{}
	if *disableMailer {
		adminOptions = append(adminOptions, controllers.WithWorker(nil))
	}
	adminOptions = append(adminOptions, controllers.WithGlobalConfig(conf))

	adminConfig := conf.AdminConf
	adminServer := controllers.NewAdminServer(adminConfig, conf.Keycloak, adminOptions...)
	middleware.Store.Options.Secure = false
	middleware.Store.Options.SameSite = http.SameSiteLaxMode

	//phishConfig := conf.PhishConf
	//phishServer := controllers.NewPhishingServer(phishConfig)

	imapMonitor := imap.NewMonitor()
	if *mode == "admin" || *mode == "all" {
		go adminServer.Start()
		go imapMonitor.Start()
	}
	//if *mode == "phish" || *mode == "all" {
	//	go phishServer.Start()
	//}

	// Handle graceful shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	<-c
	log.Info("CTRL+C Received... Gracefully shutting down servers")
	if *mode == modeAdmin || *mode == modeAll {
		adminServer.Shutdown()
		imapMonitor.Shutdown()
	}
	//if *mode == modePhish || *mode == modeAll {
	//	phishServer.Shutdown()
	//}

}
