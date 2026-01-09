package api

import (
	"encoding/json"
	"net/http"

	"github.com/7nikhilkamboj/TrustStrike-Simulation/auth"
	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Success bool   `json:"success"`
	APIKey  string `json:"api_key"`
	Message string `json:"message,omitempty"`
}

func (as *Server) GetAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request body"}, http.StatusBadRequest)
		return
	}

	u, err := models.GetUserByUsername(req.Username)
	if err != nil {
		log.Error(err)
		JSONResponse(w, models.Response{Success: false, Message: "Invalid Username/Password"}, http.StatusUnauthorized)
		return
	}

	err = auth.ValidatePassword(req.Password, u.Hash)
	if err != nil {
		log.Error(err)
		JSONResponse(w, models.Response{Success: false, Message: "Invalid Username/Password"}, http.StatusUnauthorized)
		return
	}

	if u.AccountLocked {
		JSONResponse(w, models.Response{Success: false, Message: "Account Locked"}, http.StatusUnauthorized)
		return
	}

	JSONResponse(w, LoginResponse{
		Success: true,
		APIKey:  u.ApiKey,
	}, http.StatusOK)
}
