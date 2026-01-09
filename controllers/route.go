package controllers

import (
	"compress/gzip"
	"context"
	"crypto/tls"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/7nikhilkamboj/TrustStrike-Simulation/auth"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/config"
	ctx "github.com/7nikhilkamboj/TrustStrike-Simulation/context"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/controllers/api"
	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	mid "github.com/7nikhilkamboj/TrustStrike-Simulation/middleware"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/middleware/ratelimit"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/util"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/worker"
	"github.com/NYTimes/gziphandler"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gorilla/csrf"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/gorilla/sessions"
	"github.com/jordan-wright/unindexed"
	"golang.org/x/oauth2"
)

// AdminServerOption is a functional option that is used to configure the
// admin server
type AdminServerOption func(*AdminServer)

// AdminServer is an HTTP server that implements the administrative trust_strike
// handlers, including the dashboard and REST API.
type AdminServer struct {
	server       *http.Server
	worker       worker.Worker
	config       config.AdminServer
	keycloak     config.Keycloak
	limiter      *ratelimit.PostLimiter
	globalConfig *config.Config
}

var defaultTLSConfig = &tls.Config{
	PreferServerCipherSuites: true,
	CurvePreferences: []tls.CurveID{
		tls.X25519,
		tls.CurveP256,
	},
	MinVersion: tls.VersionTLS12,
	CipherSuites: []uint16{
		tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
		tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
		tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,
		tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
		tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
		tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,

		// Kept for backwards compatibility with some clients
		tls.TLS_RSA_WITH_AES_256_GCM_SHA384,
		tls.TLS_RSA_WITH_AES_128_GCM_SHA256,
	},
}

// WithWorker is an option that sets the background worker.
func WithWorker(w worker.Worker) AdminServerOption {
	return func(as *AdminServer) {
		as.worker = w
	}
}

func WithGlobalConfig(cfg *config.Config) AdminServerOption {
	return func(as *AdminServer) {
		as.globalConfig = cfg
	}
}

// NewAdminServer returns a new instance of the AdminServer with the
// provided config and options applied.
func NewAdminServer(config config.AdminServer, keycloak config.Keycloak, options ...AdminServerOption) *AdminServer {
	defaultWorker, _ := worker.New()
	defaultServer := &http.Server{
		ReadTimeout: 10 * time.Second,
		Addr:        config.ListenURL,
	}
	defaultLimiter := ratelimit.NewPostLimiter()
	as := &AdminServer{
		worker:   defaultWorker,
		server:   defaultServer,
		limiter:  defaultLimiter,
		config:   config,
		keycloak: keycloak,
	}
	for _, opt := range options {
		opt(as)
	}
	models.InitJobManager()
	as.registerRoutes()
	return as
}

// Start launches the admin server, listening on the configured address.
func (as *AdminServer) Start() {
	if as.worker != nil {
		go as.worker.Start()
	}
	if as.config.UseTLS {
		// Only support TLS 1.2 and above - ref #1691, #1689
		as.server.TLSConfig = defaultTLSConfig
		err := util.CheckAndCreateSSL(as.config.CertPath, as.config.KeyPath)
		if err != nil {
			log.Fatal(err)
		}
		log.Infof("Starting admin server at https://%s", as.config.ListenURL)
		log.Fatal(as.server.ListenAndServeTLS(as.config.CertPath, as.config.KeyPath))
	}
	// If TLS isn't configured, just listen on HTTP
	log.Infof("Starting admin server at http://%s", as.config.ListenURL)
	log.Fatal(as.server.ListenAndServe())
}

// Shutdown attempts to gracefully shutdown the server.
func (as *AdminServer) Shutdown() error {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()
	return as.server.Shutdown(ctx)
}

// SetupAdminRoutes creates the routes for handling requests to the web interface.
// This function returns an http.Handler to be used in http.ListenAndServe().
func (as *AdminServer) registerRoutes() {
	router := mux.NewRouter()
	// Base Front-end routes
	router.HandleFunc("/", mid.Use(as.Base, mid.RequireLogin))
	router.HandleFunc("/login", mid.Use(as.Login, as.limiter.Limit))
	router.HandleFunc("/logout", mid.Use(as.Logout, mid.RequireLogin))
	router.HandleFunc("/login/keycloak", as.KeycloakLogin)
	router.HandleFunc("/login/keycloak/callback", as.KeycloakCallback)
	router.HandleFunc("/reset_password", mid.Use(as.ResetPassword, mid.RequireLogin))
	router.HandleFunc("/campaigns", mid.Use(as.Campaigns, mid.RequireLogin))
	router.HandleFunc("/qr_campaigns", mid.Use(as.QRCampaigns, mid.RequireLogin))
	router.HandleFunc("/campaigns/{id:[0-9]+}", mid.Use(as.CampaignID, mid.RequireLogin))
	router.HandleFunc("/templates", mid.Use(as.Templates, mid.RequireLogin))
	router.HandleFunc("/templates/email", mid.Use(as.EmailTemplates, mid.RequireLogin))
	router.HandleFunc("/templates/qr", mid.Use(as.QRTemplates, mid.RequireLogin))
	router.HandleFunc("/templates/sms", mid.Use(as.SMSTemplates, mid.RequireLogin))
	router.HandleFunc("/groups", mid.Use(as.Groups, mid.RequireLogin))
	router.HandleFunc("/landing_pages", mid.Use(as.LandingPages, mid.RequireLogin))
	router.HandleFunc("/landing_page", mid.Use(as.LandingPageEdit, mid.RequireLogin))
	router.HandleFunc("/landing_page/{id:[0-9]+}", mid.Use(as.LandingPageEdit, mid.RequireLogin))
	router.HandleFunc("/redirectors", mid.Use(as.Redirectors, mid.RequireLogin))
	router.HandleFunc("/sending_profiles", mid.Use(as.SendingProfiles, mid.RequireLogin))
	router.HandleFunc("/sending_profile", mid.Use(as.SendingProfileEdit, mid.RequireLogin))
	router.HandleFunc("/sending_profile/{id:[0-9]+}", mid.Use(as.SendingProfileEdit, mid.RequireLogin)).Methods("GET")
	router.HandleFunc("/template", mid.Use(as.TemplateEdit, mid.RequireLogin)).Methods("GET")
	router.HandleFunc("/template/{id:[0-9]+}", mid.Use(as.TemplateEdit, mid.RequireLogin)).Methods("GET")
	router.HandleFunc("/group", mid.Use(as.GroupEdit, mid.RequireLogin)).Methods("GET")
	router.HandleFunc("/group/{id:[0-9]+}", mid.Use(as.GroupEdit, mid.RequireLogin)).Methods("GET")
	router.HandleFunc("/campaign", mid.Use(as.CampaignEdit, mid.RequireLogin)).Methods("GET")
	router.HandleFunc("/campaign/{id:[0-9]+}", mid.Use(as.CampaignEdit, mid.RequireLogin)).Methods("GET")

	router.HandleFunc("/sending_profiles/email", mid.Use(as.EmailSendingProfiles, mid.RequireLogin))
	router.HandleFunc("/sending_profiles/sms", mid.Use(as.SMSSendingProfiles, mid.RequireLogin))
	router.HandleFunc("/sms_campaigns", mid.Use(as.SMSCampaigns, mid.RequireLogin))
	router.HandleFunc("/settings", mid.Use(as.Settings, mid.RequireLogin))
	router.HandleFunc("/simulationserver", mid.Use(as.SimulationServer, mid.RequireLogin))
	router.HandleFunc("/phishlets", mid.Use(as.Phishlets, mid.RequireLogin))
	router.HandleFunc("/user_groups", mid.Use(as.UserGroups, mid.RequirePermission(models.PermissionModifySystem), mid.RequireLogin))
	router.HandleFunc("/users", mid.Use(as.UserManagement, mid.RequirePermission(models.PermissionModifySystem), mid.RequireLogin))
	router.HandleFunc("/webhooks", mid.Use(as.Webhooks, mid.RequirePermission(models.PermissionModifySystem), mid.RequireLogin))
	router.HandleFunc("/impersonate", mid.Use(as.Impersonate, mid.RequirePermission(models.PermissionModifySystem), mid.RequireLogin))
	router.HandleFunc("/stop_impersonating", mid.Use(as.StopImpersonating, mid.RequireLogin))
	// Create the API routes
	api := api.NewServer(
		api.WithWorker(as.worker),
		api.WithLimiter(as.limiter),
		api.WithConfig(as.globalConfig),
	)
	router.PathPrefix("/api/").Handler(api)

	// Setup static file serving
	router.PathPrefix("/").Handler(http.FileServer(unindexed.Dir("./static/")))

	// Setup CSRF Protection
	csrfKey := []byte(as.config.CSRFKey)
	if len(csrfKey) == 0 {
		csrfKey = []byte(auth.GenerateSecureKey(auth.APIKeyLength))
	}
	csrfHandler := csrf.Protect(csrfKey,
		csrf.FieldName("csrf_token"),
		csrf.CookieName("trust_strike_csrf"),
		csrf.Secure(as.config.UseTLS),
		csrf.TrustedOrigins(as.config.TrustedOrigins),
		csrf.ErrorHandler(http.HandlerFunc(as.handleCSRFError)))
	adminHandler := csrfHandler(router)
	adminHandler = mid.Use(adminHandler.ServeHTTP, mid.CSRFExceptions, mid.GetContext, mid.ApplySecurityHeaders)

	// Setup GZIP compression
	gzipWrapper, _ := gziphandler.NewGzipLevelHandler(gzip.BestCompression)
	adminHandler = gzipWrapper(adminHandler)

	// Respect X-Forwarded-For and X-Real-IP headers in case we're behind a
	// reverse proxy.
	adminHandler = handlers.ProxyHeaders(adminHandler)

	// Setup logging
	adminHandler = handlers.CombinedLoggingHandler(log.Writer(), adminHandler)
	as.server.Handler = adminHandler
}

// handleCSRFError handles the error returned by the CSRF middleware
func (as *AdminServer) handleCSRFError(w http.ResponseWriter, r *http.Request) {
	log.Errorf("CSRF Error: %v", csrf.FailureReason(r))
	http.Error(w, fmt.Sprintf("Forbidden - CSRF token invalid: %v", csrf.FailureReason(r)), http.StatusForbidden)
}

type templateParams struct {
	Title           string
	Flashes         []interface{}
	User            models.User
	Token           string
	Version         string
	ModifySystem    bool
	IsImpersonating bool
}

// newTemplateParams returns the default template parameters for a user and
// the CSRF token.
func newTemplateParams(r *http.Request) templateParams {
	params := templateParams{
		Token:   csrf.Token(r),
		Version: config.Version,
	}
	if u := ctx.Get(r, "user"); u != nil {
		user := u.(models.User)
		params.User = user
		params.ModifySystem, _ = user.HasPermission(models.PermissionModifySystem)
	}
	if session := ctx.Get(r, "session"); session != nil {
		params.Flashes = session.(*sessions.Session).Flashes()
	}

	// Check if user is impersonating
	if _, err := r.Cookie("trust_strike_impersonator"); err == nil {
		params.IsImpersonating = true
	}

	return params
}

// Base handles the default path and template execution
func (as *AdminServer) Base(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Dashboard"
	getTemplate(w, "dashboard").ExecuteTemplate(w, "base", params)
}

// Campaigns handles the default path and template execution
func (as *AdminServer) Campaigns(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Email Campaigns"
	getTemplate(w, "campaigns").ExecuteTemplate(w, "base", params)
}

// QRCampaigns handles the default path and template execution
func (as *AdminServer) QRCampaigns(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "QR Campaigns"
	getTemplate(w, "qr_campaigns").ExecuteTemplate(w, "base", params)
}

// SimulationServer handles the default path and template execution
func (as *AdminServer) SimulationServer(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "SimulationServer Integration"
	getTemplate(w, "simulationserver").ExecuteTemplate(w, "base", params)
}

// Phishlets handles the phishlet management page
func (as *AdminServer) Phishlets(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Phishlet Management"
	getTemplate(w, "phishlets").ExecuteTemplate(w, "base", params)
}

// CampaignID handles the default path and template execution
func (as *AdminServer) CampaignID(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Campaign Results"
	getTemplate(w, "campaign_results").ExecuteTemplate(w, "base", params)
}

// Templates handles the default path and template execution
func (as *AdminServer) Templates(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Email Templates"
	getTemplate(w, "templates").ExecuteTemplate(w, "base", params)
}

// EmailTemplates handles the default path and template execution
func (as *AdminServer) EmailTemplates(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Email Templates"
	getTemplate(w, "templates").ExecuteTemplate(w, "base", params)
}

// QRTemplates handles the default path and template execution
func (as *AdminServer) QRTemplates(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "QR Templates"
	getTemplate(w, "templates").ExecuteTemplate(w, "base", params)
}

// SMSTemplates handles the default path and template execution
func (as *AdminServer) SMSTemplates(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "SMS Templates"
	getTemplate(w, "templates").ExecuteTemplate(w, "base", params)
}

// Groups handles the default path and template execution
func (as *AdminServer) Groups(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Users & Groups"
	getTemplate(w, "groups").ExecuteTemplate(w, "base", params)
}

// LandingPages handles the default path and template execution
func (as *AdminServer) LandingPages(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Landing Pages"
	getTemplate(w, "landing_pages").ExecuteTemplate(w, "base", params)
}

// Redirectors handles the redirectors management page
func (as *AdminServer) Redirectors(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Redirectors"
	getTemplate(w, "redirectors").ExecuteTemplate(w, "base", params)
}

// LandingPageEdit handles the editing and creation of landing pages on a dedicated page
func (as *AdminServer) LandingPageEdit(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Landing Pages"
	getTemplate(w, "landing_page_edit").ExecuteTemplate(w, "base", params)
}

// SendingProfiles handles the default path and template execution
func (as *AdminServer) SendingProfiles(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Email Sending Profiles"
	getTemplate(w, "sending_profiles").ExecuteTemplate(w, "base", params)
}

// SendingProfileEdit handles the editing and creation of sending profiles on a dedicated page
func (as *AdminServer) SendingProfileEdit(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Sending Profiles"
	getTemplate(w, "sending_profile_edit").ExecuteTemplate(w, "base", params)
}

// TemplateEdit handles the editing and creation of templates on a dedicated page
func (as *AdminServer) TemplateEdit(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Templates"
	getTemplate(w, "template_edit").ExecuteTemplate(w, "base", params)
}

// GroupEdit handles the editing and creation of groups on a dedicated page
func (as *AdminServer) GroupEdit(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Users & Groups"
	getTemplate(w, "group_edit").ExecuteTemplate(w, "base", params)
}

// CampaignEdit handles the editing and creation of campaigns on a dedicated page
func (as *AdminServer) CampaignEdit(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Campaigns"
	getTemplate(w, "campaign_edit").ExecuteTemplate(w, "base", params)
}

// EmailSendingProfiles handles the default path and template execution
func (as *AdminServer) EmailSendingProfiles(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Email Sending Profiles"
	getTemplate(w, "sending_profiles").ExecuteTemplate(w, "base", params)
}

// SMSSendingProfiles handles the default path and template execution
func (as *AdminServer) SMSSendingProfiles(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "SMS Sending Profiles"
	getTemplate(w, "sending_profiles").ExecuteTemplate(w, "base", params)
}

// SMSCampaigns handles the default path and template execution
func (as *AdminServer) SMSCampaigns(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "SMS Campaigns"
	getTemplate(w, "campaigns").ExecuteTemplate(w, "base", params)
}

// Settings handles the changing of settings
func (as *AdminServer) Settings(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == "GET":
		params := newTemplateParams(r)
		params.Title = "Settings"
		session := ctx.Get(r, "session").(*sessions.Session)
		session.Save(r, w)
		getTemplate(w, "settings").ExecuteTemplate(w, "base", params)
	case r.Method == "POST":
		u := ctx.Get(r, "user").(models.User)
		currentPw := r.FormValue("current_password")
		newPassword := r.FormValue("new_password")
		confirmPassword := r.FormValue("confirm_new_password")
		// Check the current password
		err := auth.ValidatePassword(currentPw, u.Hash)
		msg := models.Response{Success: true, Message: "Settings Updated Successfully"}
		if err != nil {
			msg.Message = err.Error()
			msg.Success = false
			api.JSONResponse(w, msg, http.StatusBadRequest)
			return
		}
		newHash, err := auth.ValidatePasswordChange(u.Hash, newPassword, confirmPassword)
		if err != nil {
			msg.Message = err.Error()
			msg.Success = false
			api.JSONResponse(w, msg, http.StatusBadRequest)
			return
		}
		u.Hash = string(newHash)
		if err = models.PutUser(&u); err != nil {
			msg.Message = err.Error()
			msg.Success = false
			api.JSONResponse(w, msg, http.StatusInternalServerError)
			return
		}
		api.JSONResponse(w, msg, http.StatusOK)
	}
}

// UserManagement is an admin-only handler that allows for the registration
// and management of user accounts within trust_strike.
func (as *AdminServer) UserManagement(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "User Management"
	getTemplate(w, "users").ExecuteTemplate(w, "base", params)
}

// UserGroups is an admin-only handler that allows for the management
// of user groups.
func (as *AdminServer) UserGroups(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "User Groups"
	getTemplate(w, "user_groups").ExecuteTemplate(w, "base", params)
}

func (as *AdminServer) nextOrIndex(w http.ResponseWriter, r *http.Request) {
	next := "/"
	url, err := url.Parse(r.FormValue("next"))
	if err == nil {
		path := url.EscapedPath()
		if path != "" {
			next = "/" + strings.TrimLeft(path, "/")
		}
	}
	http.Redirect(w, r, next, http.StatusFound)
}

func (as *AdminServer) handleInvalidLogin(w http.ResponseWriter, r *http.Request, message string) {
	session := ctx.Get(r, "session").(*sessions.Session)
	Flash(w, r, "danger", message)
	params := struct {
		User    models.User
		Title   string
		Flashes []interface{}
		Token   string
	}{Title: "Login", Token: csrf.Token(r)}
	params.Flashes = session.Flashes()
	session.Save(r, w)
	templates := template.New("template")
	_, err := templates.ParseFiles("templates/login.html", "templates/flashes.html")
	if err != nil {
		log.Error(err)
	}
	// w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	template.Must(templates, err).ExecuteTemplate(w, "base", params)
}

// Webhooks is an admin-only handler that handles webhooks
func (as *AdminServer) Webhooks(w http.ResponseWriter, r *http.Request) {
	params := newTemplateParams(r)
	params.Title = "Webhooks"
	getTemplate(w, "webhooks").ExecuteTemplate(w, "base", params)
}

// Impersonate allows an admin to login to a user account without needing the password
func (as *AdminServer) Impersonate(w http.ResponseWriter, r *http.Request) {

	if r.Method == "POST" {
		username := r.FormValue("username")
		u, err := models.GetUserByUsername(username)
		if err != nil {
			log.Error(err)
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		session := ctx.Get(r, "session").(*sessions.Session)
		session.Values["id"] = u.Id
		session.Save(r, w)

		// Check if we are already impersonating (don't overwrite original admin token)
		if _, err := r.Cookie("trust_strike_impersonator"); err != nil {
			// Save the current (admin) token before switching
			if currentCookie, err := r.Cookie("trust_strike_jwt"); err == nil {
				http.SetCookie(w, &http.Cookie{
					Name:     "trust_strike_impersonator",
					Value:    currentCookie.Value,
					Expires:  time.Now().Add(auth.TokenExpiration), // Match token expiration or reasonable duration
					HttpOnly: true,
					Path:     "/",
					Secure:   as.config.UseTLS,
				})
			}
		}

		// Generate a new JWT token for the impersonated user
		token, err := auth.GenerateToken(u.Id, u.Username, u.Role.Slug)
		if err != nil {
			log.Error(err)
			http.Error(w, "Failed to generate token", http.StatusInternalServerError)
			return
		}

		// Set the JWT cookie
		http.SetCookie(w, &http.Cookie{
			Name:     "trust_strike_jwt",
			Value:    token,
			Expires:  time.Now().Add(auth.TokenExpiration),
			HttpOnly: true,
			Path:     "/",
			Secure:   as.config.UseTLS,
		})
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

// StopImpersonating stops the impersonation session and reverts to the original user
func (as *AdminServer) StopImpersonating(w http.ResponseWriter, r *http.Request) {
	// Retrieve the original admin token
	cookie, err := r.Cookie("trust_strike_impersonator")
	if err != nil {
		// If cookie not found, just redirect home
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	// Restore the original session
	http.SetCookie(w, &http.Cookie{
		Name:     "trust_strike_jwt",
		Value:    cookie.Value,
		Expires:  time.Now().Add(auth.TokenExpiration),
		HttpOnly: true,
		Path:     "/",
		Secure:   as.config.UseTLS,
	})

	// Delete the impersonator cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "trust_strike_impersonator",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HttpOnly: true,
		Path:     "/",
		Secure:   as.config.UseTLS,
	})

	// Invalidate current session values slightly to ensure clean slate (optional but good)
	session := ctx.Get(r, "session").(*sessions.Session)
	delete(session.Values, "id")
	session.Save(r, w)

	Flash(w, r, "success", "You have successfully restored your session")
	http.Redirect(w, r, "/users", http.StatusFound)
}

// Login handles the authentication flow for a user. If credentials are valid,
// a session is created
func (as *AdminServer) Login(w http.ResponseWriter, r *http.Request) {
	params := struct {
		User            models.User
		Title           string
		Flashes         []interface{}
		Token           string
		KeycloakEnabled bool
	}{Title: "Login", Token: csrf.Token(r), KeycloakEnabled: as.keycloak.Enabled}
	session := ctx.Get(r, "session").(*sessions.Session)
	switch {
	case r.Method == "GET":
		params.Flashes = session.Flashes()
		session.Save(r, w)
		templates := template.New("template")
		_, err := templates.ParseFiles("templates/login.html", "templates/flashes.html")
		if err != nil {
			log.Error(err)
		}
		template.Must(templates, err).ExecuteTemplate(w, "base", params)
	case r.Method == "POST":
		// Find the user with the provided username
		username, password := r.FormValue("username"), r.FormValue("password")
		u, err := models.GetUserByUsername(username)
		if err != nil {
			log.Error(err)
			as.handleInvalidLogin(w, r, "Invalid Username/Password")
			return
		}
		// Validate the user's password
		err = auth.ValidatePassword(password, u.Hash)
		if err != nil {
			log.Error(err)
			as.handleInvalidLogin(w, r, "Invalid Username/Password")
			return
		}
		if u.AccountLocked {
			as.handleInvalidLogin(w, r, "Account Locked")
			return
		}
		u.LastLogin = time.Now().UTC()
		err = models.PutUser(&u)
		if err != nil {
			log.Error(err)
		}
		// If we've logged in, generate a JWT token
		token, err := auth.GenerateToken(u.Id, u.Username, u.Role.Slug)
		if err != nil {
			log.Error(err)
			as.handleInvalidLogin(w, r, "Internal Server Error")
			return
		}

		// Set the JWT cookie
		http.SetCookie(w, &http.Cookie{
			Name:     "trust_strike_jwt",
			Value:    token,
			Expires:  time.Now().Add(auth.TokenExpiration),
			HttpOnly: true,
			Path:     "/",
			Secure:   as.config.UseTLS,
		})

		as.nextOrIndex(w, r)
	}
}

// Logout destroys the current user session
func (as *AdminServer) Logout(w http.ResponseWriter, r *http.Request) {
	session := ctx.Get(r, "session").(*sessions.Session)
	idToken, hasToken := session.Values["id_token"].(string)
	delete(session.Values, "id")
	delete(session.Values, "id_token")
	Flash(w, r, "success", "You have successfully logged out")
	session.Save(r, w)

	// Invalidate JWT token on server side (add to blacklist)
	if cookie, err := r.Cookie("trust_strike_jwt"); err == nil && cookie.Value != "" {
		auth.InvalidateToken(cookie.Value)
	}

	// Clear JWT cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "trust_strike_jwt",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HttpOnly: true,
		Path:     "/",
		Secure:   as.config.UseTLS,
	})

	if as.keycloak.Enabled && hasToken {
		// Construct Keycloak logout URL
		// Format: /protocol/openid-connect/logout?id_token_hint=...&post_logout_redirect_uri=...
		// We can get the base issuer URL from DiscoveryURL by stripping .well-known... or just using a configured one.
		// For simplicity, we assume DiscoveryURL is like .../realms/{realm} and append /protocol/openid-connect/logout
		// Ideally we should use the end_session_endpoint from discovery, but we don't have it cached readily here.
		logoutURL := as.keycloak.DiscoveryURL + "/protocol/openid-connect/logout"

		q := url.Values{}
		q.Set("id_token_hint", idToken)
		// Assuming we want to come back to /login
		// We need to construct the full URL. Since we don't have the base URL handy in config (only listen URL),
		// we might need to rely on the Host header or user configuration.
		// Let's use the redirect_url config but replace the path
		if u, err := url.Parse(as.keycloak.RedirectURL); err == nil {
			u.Path = "/login"
			q.Set("post_logout_redirect_uri", u.String())
		}

		http.Redirect(w, r, logoutURL+"?"+q.Encode(), http.StatusFound)
		return
	}

	http.Redirect(w, r, "/login", http.StatusFound)
}

// ResetPassword handles the password reset flow when a password change is
// required either by the trust_strike system or an administrator.
//
// This handler is meant to be used when a user is required to reset their
// password, not just when they want to.
//
// This is an important distinction since in this handler we don't require
// the user to re-enter their current password, as opposed to the flow
// through the settings handler.
//
// To that end, if the user doesn't require a password change, we will
// redirect them to the settings page.
func (as *AdminServer) ResetPassword(w http.ResponseWriter, r *http.Request) {
	u := ctx.Get(r, "user").(models.User)
	session := ctx.Get(r, "session").(*sessions.Session)
	if !u.PasswordChangeRequired {
		Flash(w, r, "info", "Please reset your password through the settings page")
		session.Save(r, w)
		http.Redirect(w, r, "/settings", http.StatusTemporaryRedirect)
		return
	}
	params := newTemplateParams(r)
	params.Title = "Reset Password"
	switch {
	case r.Method == http.MethodGet:
		params.Flashes = session.Flashes()
		session.Save(r, w)
		getTemplate(w, "reset_password").ExecuteTemplate(w, "base", params)
		return
	case r.Method == http.MethodPost:
		newPassword := r.FormValue("password")
		confirmPassword := r.FormValue("confirm_password")
		newHash, err := auth.ValidatePasswordChange(u.Hash, newPassword, confirmPassword)
		if err != nil {
			Flash(w, r, "danger", err.Error())
			params.Flashes = session.Flashes()
			session.Save(r, w)
			w.WriteHeader(http.StatusBadRequest)
			getTemplate(w, "reset_password").ExecuteTemplate(w, "base", params)
			return
		}
		u.PasswordChangeRequired = false
		u.Hash = newHash
		if err = models.PutUser(&u); err != nil {
			Flash(w, r, "danger", err.Error())
			params.Flashes = session.Flashes()
			session.Save(r, w)
			w.WriteHeader(http.StatusInternalServerError)
			getTemplate(w, "reset_password").ExecuteTemplate(w, "base", params)
			return
		}
		// TODO: We probably want to flash a message here that the password was
		// changed successfully. The problem is that when the user resets their
		// password on first use, they will see two flashes on the dashboard-
		// one for their password reset, and one for the "no campaigns created".
		//
		// The solution to this is to revamp the empty page to be more useful,
		// like a wizard or something.
		as.nextOrIndex(w, r)
	}
}

// TODO: Make this execute the template, too
func getTemplate(w http.ResponseWriter, tmpl string) *template.Template {
	templates := template.New("template")
	_, err := templates.ParseFiles("templates/base.html", "templates/nav.html", "templates/"+tmpl+".html", "templates/flashes.html")
	if err != nil {
		log.Error(err)
	}
	return template.Must(templates, err)
}

// Flash handles the rendering flash messages
func Flash(w http.ResponseWriter, r *http.Request, t string, m string) {
	session := ctx.Get(r, "session").(*sessions.Session)
	session.AddFlash(models.Flash{
		Type:    t,
		Message: m,
	})
}

func (as *AdminServer) KeycloakLogin(w http.ResponseWriter, r *http.Request) {
	if !as.keycloak.Enabled {
		http.NotFound(w, r)
		return
	}
	provider, err := oidc.NewProvider(context.Background(), as.keycloak.DiscoveryURL)
	if err != nil {
		log.Error(err)
		http.Error(w, "Failed to get provider: "+err.Error(), http.StatusInternalServerError)
		return
	}
	config := oauth2.Config{
		ClientID:     as.keycloak.ClientID,
		ClientSecret: as.keycloak.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  as.keycloak.RedirectURL,
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}
	state := auth.GenerateSecureKey(16)
	session := ctx.Get(r, "session").(*sessions.Session)
	session.Values["state"] = state
	session.Save(r, w)

	http.Redirect(w, r, config.AuthCodeURL(state), http.StatusFound)
}

func (as *AdminServer) KeycloakCallback(w http.ResponseWriter, r *http.Request) {
	if !as.keycloak.Enabled {
		http.NotFound(w, r)
		return
	}
	session := ctx.Get(r, "session").(*sessions.Session)
	state := session.Values["state"]
	if state == nil || r.URL.Query().Get("state") != state.(string) {
		http.Error(w, "State mismatch", http.StatusBadRequest)
		return
	}

	provider, err := oidc.NewProvider(context.Background(), as.keycloak.DiscoveryURL)
	if err != nil {
		log.Error(err)
		http.Error(w, "Failed to get provider", http.StatusInternalServerError)
		return
	}

	endpoint := provider.Endpoint()
	endpoint.AuthStyle = oauth2.AuthStyleInParams
	oauth2Config := oauth2.Config{
		ClientID:     as.keycloak.ClientID,
		ClientSecret: as.keycloak.ClientSecret,
		Endpoint:     endpoint,
		RedirectURL:  as.keycloak.RedirectURL,
	}

	oauth2Token, err := oauth2Config.Exchange(context.Background(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "Failed to exchange token: "+err.Error(), http.StatusInternalServerError)
		return
	}

	userInfo, err := provider.UserInfo(context.Background(), oauth2.StaticTokenSource(oauth2Token))
	if err != nil {
		http.Error(w, "Failed to get userinfo: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Mapping: Check if user exists by Username = preferred_username
	var claims struct {
		PreferredUsername string `json:"preferred_username"`
		Email             string `json:"email"`
	}
	if err := userInfo.Claims(&claims); err != nil {
		http.Error(w, "Failed to parse claims: "+err.Error(), http.StatusInternalServerError)
		return
	}

	username := claims.PreferredUsername
	if username == "" {
		username = claims.Email
	}

	user, err := models.GetUserByUsername(username)
	if err != nil {
		log.Error("Keycloak login failed: user not found in trust_strike: " + username)
		Flash(w, r, "danger", "Invalid Username/Password")
		session.Save(r, w)

		// Force logout from Keycloak to prevent immediate loop on retry
		if idToken, ok := oauth2Token.Extra("id_token").(string); ok {
			logoutURL := as.keycloak.DiscoveryURL + "/protocol/openid-connect/logout"
			q := url.Values{}
			q.Set("id_token_hint", idToken)
			if u, err := url.Parse(as.keycloak.RedirectURL); err == nil {
				u.Path = "/login"
				q.Set("post_logout_redirect_uri", u.String())
			}
			http.Redirect(w, r, logoutURL+"?"+q.Encode(), http.StatusFound)
			return
		}

		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}

	// Login Successful
	user.LastLogin = time.Now().UTC()
	models.PutUser(&user)
	session.Values["id"] = user.Id
	if idToken, ok := oauth2Token.Extra("id_token").(string); ok {
		session.Values["id_token"] = idToken
	}
	session.Save(r, w)
	http.Redirect(w, r, "/", http.StatusFound)
}
