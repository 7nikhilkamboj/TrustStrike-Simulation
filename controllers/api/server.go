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
	router.HandleFunc("/imap/", as.IMAPServer)
	router.HandleFunc("/imap/validate", as.IMAPServerValidate)
	router.HandleFunc("/reset", as.Reset)
	router.HandleFunc("/campaigns/", as.Campaigns)
	router.HandleFunc("/campaigns/summary", as.CampaignsSummary)
	router.HandleFunc("/campaigns/{id:[0-9]+}", as.Campaign)
	router.HandleFunc("/campaigns/{id:[0-9]+}/results", as.CampaignResults)
	router.HandleFunc("/campaigns/{id:[0-9]+}/summary", as.CampaignSummary)
	router.HandleFunc("/campaigns/{id:[0-9]+}/complete", as.CampaignComplete)
	router.HandleFunc("/groups/", as.Groups)
	router.HandleFunc("/groups/summary", as.GroupsSummary)
	router.HandleFunc("/groups/{id:[0-9]+}", as.Group)
	router.HandleFunc("/groups/{id:[0-9]+}/summary", as.GroupSummary)
	router.HandleFunc("/templates/", as.Templates)
	router.HandleFunc("/templates/{id:[0-9]+}", as.Template)
	router.HandleFunc("/pages/", as.Pages)
	router.HandleFunc("/pages/{id:[0-9]+}", as.Page)
	router.HandleFunc("/smtp/", as.SendingProfiles)
	router.HandleFunc("/smtp/{id:[0-9]+}", as.SendingProfile)
	router.HandleFunc("/sms/", as.SMSProfiles)
	router.HandleFunc("/sms/{id:[0-9]+}", as.SMSProfile)
	router.HandleFunc("/sms_campaigns/", as.SMSCampaigns)
	router.HandleFunc("/users/", mid.Use(as.Users, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/users/{id:[0-9]+}", mid.Use(as.User))
	router.HandleFunc("/user_groups/", mid.Use(as.UserGroups, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/user_groups/{id:[0-9]+}", mid.Use(as.UserGroup, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/user_groups/{id:[0-9]+}/members", mid.Use(as.UserGroupMembers, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/user_groups/{id:[0-9]+}/members/{user_id:[0-9]+}", mid.Use(as.UserGroupMember, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/util/send_test_email", as.SendTestEmail)

	// Phishlets Proxy
	router.PathPrefix("/phishlets").HandlerFunc(as.PhishletsProxy)
	router.HandleFunc("/import/group", as.ImportGroup)
	router.HandleFunc("/import/group/bulk", as.UploadBulkCSV)
	router.HandleFunc("/import/group/bulk_confirm", as.CommitBulkImport)
	router.HandleFunc("/import/jobs/active", as.GetActiveJobs).Methods("GET")
	router.HandleFunc("/import/job/{id}", as.GetJobStatus)
	router.HandleFunc("/import/job/{id}/cancel", as.CancelBulkImport).Methods("POST")
	router.HandleFunc("/import/email", as.ImportEmail)
	router.HandleFunc("/import/site", as.ImportSite)
	router.HandleFunc("/webhooks/", mid.Use(as.Webhooks, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/webhooks/{id:[0-9]+}/validate", mid.Use(as.ValidateWebhook, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/webhooks/{id:[0-9]+}", mid.Use(as.Webhook, mid.RequirePermission(models.PermissionModifySystem)))
	router.HandleFunc("/results/{id:[a-zA-Z0-9]+}/open", as.ResultOpen)
	router.HandleFunc("/results/{id:[a-zA-Z0-9]+}/click", as.ResultClick)
	router.HandleFunc("/results/{id:[a-zA-Z0-9]+}/submit", as.ResultSubmit)

	//Simulation server API's
	router.HandleFunc("/simulationserver/trigger_strike", as.TriggerStrike).Methods("POST")
	router.HandleFunc("/simulationserver/get_strikes", as.GetStrikes).Methods("GET")
	router.HandleFunc("/simulationserver/get_config", as.GetConfig).Methods("GET")

	router.HandleFunc("/simulationserver/modules", as.GetModules).Methods("GET")
	router.HandleFunc("/simulationserver/strikes/create", as.CreateStrike).Methods("POST")
	router.HandleFunc("/simulationserver/strikes/{id}/edit", as.EditStrike).Methods("POST")
	router.HandleFunc("/simulationserver/strikes/{id}", as.DeleteStrike).Methods("DELETE")

	// Config API's
	router.HandleFunc("/simulationserver/config/domain", as.SetDomain).Methods("POST")
	router.HandleFunc("/simulationserver/config/ipv4", as.SetIPv4).Methods("POST")
	router.HandleFunc("/simulationserver/config/unauth_url", as.SetUnauthURL).Methods("POST")
	router.HandleFunc("/simulationserver/config/gophish", as.SetGophish).Methods("POST")

	// Phishlet API's
	router.HandleFunc("/simulationserver/modules/{name}/hostname", as.SetPhishletHostname).Methods("POST")
	router.HandleFunc("/simulationserver/modules/{name}/toggle", as.TogglePhishlet).Methods("POST")
	router.HandleFunc("/simulationserver/modules/{name}/landing_domain", as.SetPhishletLandingDomain).Methods("POST")
	router.HandleFunc("/simulationserver/modules/{name}/hosts", as.GetPhishletHosts).Methods("GET")
	router.HandleFunc("/simulationserver/phishlets/{name}", as.UpdatePhishletSubdomain).Methods("PUT")

	// Cloudflare API's
	router.HandleFunc("/simulationserver/config/cloudflare", as.SetCloudflare).Methods("POST")
	router.HandleFunc("/simulationserver/config/cloudflare_info", as.GetCloudflareConfig).Methods("GET")
	router.HandleFunc("/simulationserver/config/fetch_alldomains", as.FetchAllDomains).Methods("GET")
	router.HandleFunc("/simulationserver/config/fetch_dns_records", as.FetchDNSRecords).Methods("GET")
	router.HandleFunc("/simulationserver/config/create_dns_record", as.CreateDNSRecord).Methods("POST")
	router.HandleFunc("/simulationserver/config/delete_dns_record", as.DeleteDNSRecord).Methods("DELETE")
	router.HandleFunc("/simulationserver/config/cloudflare_setup", as.SetupCloudflare).Methods("POST")

	// Redirector API's
	router.HandleFunc("/simulationserver/redirectors", as.GetRedirectors).Methods("GET")
	router.HandleFunc("/simulationserver/redirectors", as.CreateRedirector).Methods("POST")
	router.HandleFunc("/simulationserver/redirectors/{name}", as.GetRedirector).Methods("GET")
	router.HandleFunc("/simulationserver/redirectors/{name}", as.UpdateRedirector).Methods("PUT")
	router.HandleFunc("/simulationserver/redirectors/{name}", as.DeleteRedirector).Methods("DELETE")

	// EC2 Management API's
	router.HandleFunc("/simulationserver/ec2/status", as.GetEC2Status).Methods("GET")
	router.HandleFunc("/simulationserver/ec2/start", as.StartEC2Instance).Methods("POST")
	router.HandleFunc("/simulationserver/ec2/stop", as.StopEC2Instance).Methods("POST")

	as.handler = root
}

func (as *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	as.handler.ServeHTTP(w, r)
}
