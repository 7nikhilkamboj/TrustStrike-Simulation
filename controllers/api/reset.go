package api

import (
	"net/http"

	"github.com/7nikhilkamboj/TrustStrike-Simulation/auth"
	ctx "github.com/7nikhilkamboj/TrustStrike-Simulation/context"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
)

// Reset (/api/reset) resets the currently authenticated user's API key
func (as *Server) Reset(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == "POST":
		u := ctx.Get(r, "user").(models.User)
		newApiKey := auth.GenerateSecureKey(auth.APIKeyLength)

		// If user is an admin, update API key for all admins
		if u.Role.Slug == models.RoleAdmin {
			err := models.UpdateAllAdminApiKeys(newApiKey)
			if err != nil {
				http.Error(w, "Error setting API Key for admins", http.StatusInternalServerError)
				return
			}
			u.ApiKey = newApiKey
		} else {
			u.ApiKey = newApiKey
			err := models.PutUser(&u)
			if err != nil {
				http.Error(w, "Error setting API Key", http.StatusInternalServerError)
				return
			}
		}
		JSONResponse(w, models.Response{Success: true, Message: "API Key successfully reset!", Data: u.ApiKey}, http.StatusOK)
	}
}
