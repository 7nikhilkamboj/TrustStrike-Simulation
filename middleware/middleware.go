package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/csrf"
	"github.com/trust_strike/trust_strike/auth"
	ctx "github.com/trust_strike/trust_strike/context"
	"github.com/trust_strike/trust_strike/models"
)

// CSRFExemptPrefixes are a list of routes that are exempt from CSRF protection
var CSRFExemptPrefixes = []string{
	"/api",
}

// CSRFExceptions is a middleware that prevents CSRF checks on routes listed in
// CSRFExemptPrefixes.
func CSRFExceptions(handler http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		for _, prefix := range CSRFExemptPrefixes {
			if strings.HasPrefix(r.URL.Path, prefix) {
				r = csrf.UnsafeSkipCheck(r)
				break
			}
		}
		handler.ServeHTTP(w, r)
	}
}

// Use allows us to stack middleware to process the request
// Example taken from https://github.com/gorilla/mux/pull/36#issuecomment-25849172
func Use(handler http.HandlerFunc, mid ...func(http.Handler) http.HandlerFunc) http.HandlerFunc {
	for _, m := range mid {
		handler = m(handler)
	}
	return handler
}

// GetContext wraps each request in a function which fills in the context for a given request.
// This includes setting the User and Session keys and values as necessary for use in later functions.
func GetContext(handler http.Handler) http.HandlerFunc {
	// Set the context here
	return func(w http.ResponseWriter, r *http.Request) {
		// Set the context appropriately here.
		// Set the session
		session, _ := Store.Get(r, "trust_strike")
		// Put the session in the context so that we can
		// reuse the values in different handlers
		r = ctx.Set(r, "session", session)

		// Check for JWT token in cookie
		token := ""
		if cookie, err := r.Cookie("trust_strike_jwt"); err == nil {
			token = cookie.Value
		}

		var userId int64
		var err error
		if token != "" {
			userId, err = auth.ValidateToken(token)
		} else if id, ok := session.Values["id"].(int64); ok {
			userId = id
			err = nil
		} else {
			err = fmt.Errorf("no authentication found")
		}

		if err == nil {
			u, err := models.GetUser(userId)
			if err == nil {
				r = ctx.Set(r, "user", u)
				r = ctx.Set(r, "user_id", u.Id)
			} else {
				r = ctx.Set(r, "user", nil)
			}
		} else {
			r = ctx.Set(r, "user", nil)
		}

		handler.ServeHTTP(w, r)
		// Remove context contents
		ctx.Clear(r)
	}
}

// RequireAPIKey ensures that a valid authentication token is provided.
// It supports both legacy API keys and modern JWT tokens (via Bearer token or api_key param).
func RequireAPIKey(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			w.Header().Set("Access-Control-Max-Age", "1000")
			w.Header().Set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-CSRF-Token")
			return
		}

		// 1. Check if user is already in context (e.g. from GetContext middleware)
		if u := ctx.Get(r, "user"); u != nil {
			handler.ServeHTTP(w, r)
			return
		}

		// 2. Check for API Key in params or header (if allowed)
		apiKey := r.URL.Query().Get("api_key")
		if apiKey == "" {
			// Only allow Authorization header for specific paths
			allowed := false
			path := r.URL.Path
			if path == "/api/campaigns" || path == "/api/campaigns/" {
				allowed = true
			} else if strings.HasPrefix(path, "/api/results/") {
				if strings.HasSuffix(path, "/open") || strings.HasSuffix(path, "/click") || strings.HasSuffix(path, "/submit") {
					allowed = true
				}
			}

			if allowed {
				bearer := r.Header.Get("Authorization")
				if len(bearer) > 7 && strings.ToUpper(bearer[0:6]) == "BEARER" {
					apiKey = bearer[7:]
				} else {
					apiKey = bearer
				}
			}
		}

		// If API Key is provided, validate strictly as API Key
		if apiKey != "" {
			u, err := models.GetUserByAPIKey(apiKey)
			if err != nil {
				JSONError(w, http.StatusUnauthorized, "Invalid API Key")
				return
			}
			r = ctx.Set(r, "user", u)
			r = ctx.Set(r, "user_id", u.Id)
			r = ctx.Set(r, "api_key", u.ApiKey)
			handler.ServeHTTP(w, r)
			return
		}

		// 3. Fallback: Check for JWT in cookie strictly
		if cookie, err := r.Cookie("trust_strike_jwt"); err == nil {
			userId, err := auth.ValidateToken(cookie.Value)
			if err == nil {
				u, err := models.GetUser(userId)
				if err == nil {
					r = ctx.Set(r, "user", u)
					handler.ServeHTTP(w, r)
					return
				}
			}
		}

		JSONError(w, http.StatusUnauthorized, "Authentication required")
	})
}

// RequireLogin checks to see if the user is currently logged in.
// If not, the function returns a 302 redirect to the login page.
func RequireLogin(handler http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u := ctx.Get(r, "user"); u != nil {
			// If a password change is required for the user, then redirect them
			// to the login page
			currentUser := u.(models.User)
			if currentUser.PasswordChangeRequired && r.URL.Path != "/reset_password" {
				q := r.URL.Query()
				q.Set("next", r.URL.Path)
				http.Redirect(w, r, fmt.Sprintf("/reset_password?%s", q.Encode()), http.StatusTemporaryRedirect)
				return
			}
			handler.ServeHTTP(w, r)
			return
		}
		q := r.URL.Query()
		q.Set("next", r.URL.Path)
		http.Redirect(w, r, fmt.Sprintf("/login?%s", q.Encode()), http.StatusTemporaryRedirect)
	}
}

// EnforceViewOnly is a global middleware that limits the ability to edit
// objects to accounts with the PermissionModifyObjects permission.
func EnforceViewOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// If the request is for any non-GET HTTP method, e.g. POST, PUT,
		// or DELETE, we need to ensure the user has the appropriate
		// permission.
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			user := ctx.Get(r, "user").(models.User)
			access, err := user.HasPermission(models.PermissionModifyObjects)
			if err != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			if !access {
				http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePermission checks to see if the user has the requested permission
// before executing the handler. If the request is unauthorized, a JSONError
// is returned.
func RequirePermission(perm string) func(http.Handler) http.HandlerFunc {
	return func(next http.Handler) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			user := ctx.Get(r, "user").(models.User)
			access, err := user.HasPermission(perm)
			if err != nil {
				JSONError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if !access {
				JSONError(w, http.StatusForbidden, http.StatusText(http.StatusForbidden))
				return
			}
			next.ServeHTTP(w, r)
		}
	}
}

// ApplySecurityHeaders applies various security headers according to best-
// practices.
func ApplySecurityHeaders(next http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		csp := "frame-ancestors 'none';"
		w.Header().Set("Content-Security-Policy", csp)
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	}
}

// JSONError returns an error in JSON format with the given
// status code and message
func JSONError(w http.ResponseWriter, c int, m string) {
	cj, _ := json.MarshalIndent(models.Response{Success: false, Message: m}, "", "  ")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(c)
	fmt.Fprintf(w, "%s", cj)
}
