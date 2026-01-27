package api

import (
	"net/http"

	"github.com/7nikhilkamboj/TrustStrike-Simulation/config"
	mid "github.com/7nikhilkamboj/TrustStrike-Simulation/middleware"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/middleware/ratelimit"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/worker"
	"github.com/gorilla/mux"
)

// ServerOption is an option to apply to the API server.
type ServerOption func(*Server)

type Server struct {
	handler   http.Handler
	worker    worker.Worker
	smsworker worker.Worker
	limiter   *ratelimit.PostLimiter
	config    *config.Config
}

// NewServer returns a new instance of the API handler with the provided
// options applied.
func NewServer(options ...ServerOption) *Server {
	defaultWorker, _ := worker.New()
	defaultSMSWorker, _ := worker.NewSMSWorker()
	defaultLimiter := ratelimit.NewPostLimiter()
	as := &Server{
		worker:    defaultWorker,
		smsworker: defaultSMSWorker,
		limiter:   defaultLimiter,
	}
	for _, opt := range options {
		opt(as)
	}
	as.registerRoutes()
	return as
}

// WithWorker is an option that sets the background worker.
func WithWorker(w worker.Worker) ServerOption {
	return func(as *Server) {
		as.worker = w
	}
}

func WithLimiter(limiter *ratelimit.PostLimiter) ServerOption {
	return func(as *Server) {
		as.limiter = limiter
	}
}

func WithConfig(cfg *config.Config) ServerOption {
	return func(as *Server) {
		as.config = cfg
	}
}

func (as *Server) registerRoutes() {
	root := mux.NewRouter()
	root = root.StrictSlash(true)
	publicRouter := root.PathPrefix("/api/").Subrouter()
	publicRouter.HandleFunc("/login/api", as.GetAPI).Methods("POST")

	router := publicRouter.PathPrefix("/").Subrouter()

	router.Use(mid.RequireAPIKey)
	router.Use(mid.EnforceViewOnly)
	router.HandleFunc("/imap/", mid.Use(as.IMAPServer))
	router.HandleFunc("/imap/validate", mid.Use(as.IMAPServerValidate, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/campaigns/", as.Campaigns)
	router.HandleFunc("/campaigns/summary", as.CampaignsSummary)
	router.HandleFunc("/campaigns/{id:[0-9]+}", as.Campaign)
	router.HandleFunc("/campaigns/{id:[0-9]+}/results", as.CampaignResults)
	router.HandleFunc("/campaigns/{id:[0-9]+}/summary", as.CampaignSummary)
	router.HandleFunc("/campaigns/{id:[0-9]+}/complete", mid.Use(as.CampaignComplete, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/groups/", mid.Use(as.Groups, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/groups/summary", mid.Use(as.GroupsSummary, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/groups/{id:[0-9]+}", mid.Use(as.Group, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/groups/{id:[0-9]+}/summary", mid.Use(as.GroupSummary, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/templates/", mid.Use(as.Templates, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/templates/{id:[0-9]+}", mid.Use(as.Template, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/pages/", mid.Use(as.Pages, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/pages/{id:[0-9]+}", mid.Use(as.Page, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/smtp/", mid.Use(as.SendingProfiles, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/smtp/{id:[0-9]+}", mid.Use(as.SendingProfile, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/sms/", mid.Use(as.SMSProfiles, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/sms/{id:[0-9]+}", mid.Use(as.SMSProfile, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/sms_campaigns/", as.SMSCampaigns)
	router.HandleFunc("/users/", mid.Use(as.Users, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/users/{id:[0-9]+}", mid.Use(as.User))
	router.HandleFunc("/util/send_test_email", mid.Use(as.SendTestEmail, mid.RequirePermission(models.PermissionModifySystem)))

	// Phishlets Proxy
	router.PathPrefix("/phishlets").Handler(mid.RequirePermission(models.PermissionModifySystem)(http.HandlerFunc(as.PhishletsProxy)))
	router.HandleFunc("/import/group", mid.Use(as.ImportGroup, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/import/group/bulk", mid.Use(as.UploadBulkCSV, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/import/group/bulk_confirm", mid.Use(as.CommitBulkImport, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/import/jobs/active", mid.Use(as.GetActiveJobs)).Methods("GET")
	router.HandleFunc("/import/job/{id}", mid.Use(as.GetJobStatus, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/import/job/{id}/cancel", mid.Use(as.CancelBulkImport, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/import/email", mid.Use(as.ImportEmail, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/import/site", mid.Use(as.ImportSite, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/webhooks/", mid.Use(as.Webhooks, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/webhooks/{id:[0-9]+}/validate", mid.Use(as.ValidateWebhook, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/webhooks/{id:[0-9]+}", mid.Use(as.Webhook, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/results/{id:[a-zA-Z0-9]+}/open", as.ResultOpen)
	router.HandleFunc("/results/{id:[a-zA-Z0-9]+}/click", as.ResultClick)
	router.HandleFunc("/results/{id:[a-zA-Z0-9]+}/submit", as.ResultSubmit)

	//Simulation server API's - Admin only
	router.HandleFunc("/simulationserver/trigger_strike", mid.Use(as.TriggerStrike, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/get_strikes", mid.Use(as.GetStrikes, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/get_config", mid.Use(as.GetConfig, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")

	router.HandleFunc("/simulationserver/modules", mid.Use(as.GetModules, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/strikes/create", mid.Use(as.CreateStrike, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/strikes/{id}/edit", mid.Use(as.EditStrike, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/strikes/{id}", mid.Use(as.DeleteStrike, mid.RequirePermission(models.PermissionModifySystem))).Methods("DELETE")

	// Config API's - Admin only
	router.HandleFunc("/simulationserver/config/domain", mid.Use(as.SetDomain, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/config/ipv4", mid.Use(as.SetIPv4, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/config/unauth_url", mid.Use(as.SetUnauthURL, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/config/gophish", mid.Use(as.SetGophish, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")

	// Phishlet API's - Admin only
	router.HandleFunc("/simulationserver/modules/{name}/hostname", mid.Use(as.SetPhishletHostname, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/modules/{name}/toggle", mid.Use(as.TogglePhishlet, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/modules/{name}/landing_domain", mid.Use(as.SetPhishletLandingDomain, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/modules/{name}/hosts", mid.Use(as.GetPhishletHosts, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/phishlets/{name}", mid.Use(as.UpdatePhishletSubdomain, mid.RequirePermission(models.PermissionModifySystem))).Methods("PUT")

	// Cloudflare API's - Admin only
	router.HandleFunc("/simulationserver/config/cloudflare", mid.Use(as.SetCloudflare, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/config/cloudflare_info", mid.Use(as.GetCloudflareConfig, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/config/fetch_alldomains", mid.Use(as.FetchAllDomains, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/config/fetch_dns_records", mid.Use(as.FetchDNSRecords, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/config/create_dns_record", mid.Use(as.CreateDNSRecord, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/config/delete_dns_record", mid.Use(as.DeleteDNSRecord, mid.RequirePermission(models.PermissionModifySystem))).Methods("DELETE")
	router.HandleFunc("/simulationserver/config/cloudflare_setup", mid.Use(as.SetupCloudflare, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/config/certificate", mid.Use(as.ProvisionCertificate, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")

	// Redirector API's - Admin only
	router.HandleFunc("/simulationserver/redirectors", mid.Use(as.GetRedirectors, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/redirectors", mid.Use(as.CreateRedirector, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/redirectors/{name}", mid.Use(as.GetRedirector, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/redirectors/{name}", mid.Use(as.UpdateRedirector, mid.RequirePermission(models.PermissionModifySystem))).Methods("PUT")
	router.HandleFunc("/simulationserver/redirectors/{name}", mid.Use(as.DeleteRedirector, mid.RequirePermission(models.PermissionModifySystem))).Methods("DELETE")

	// EC2 Management API's - Admin only
	router.HandleFunc("/simulationserver/ec2/status", mid.Use(as.GetEC2Status, mid.RequirePermission(models.PermissionModifySystem))).Methods("GET")
	router.HandleFunc("/simulationserver/ec2/start", mid.Use(as.StartEC2Instance, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")
	router.HandleFunc("/simulationserver/ec2/stop", mid.Use(as.StopEC2Instance, mid.RequirePermission(models.PermissionModifySystem))).Methods("POST")

	as.handler = root
}

func (as *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	as.handler.ServeHTTP(w, r)
}
