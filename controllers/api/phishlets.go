package api

import (
	"bytes"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"strings"

	"github.com/7nikhilkamboj/TrustStrike-Simulation/auth"
)

// PhishletsProxy proxies requests to the underlying simulation server
func (as *Server) PhishletsProxy(w http.ResponseWriter, r *http.Request) {
	// 1. Generate the JWT (Internal System Admin Token)
	tokenString, err := auth.GenerateToken(1, "system_admin", "admin")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, `{"success":false,"message":"Failed to generate auth token"}`)
		return
	}

	// 2. Construct the Target URL
	targetBase := as.config.SimulationServerURL
	if !strings.HasSuffix(targetBase, "/") {
		targetBase += "/"
	}

	// r.URL.Path starts with /api/phishlets...
	// We want the part after /api/
	path := strings.TrimPrefix(r.URL.Path, "/api/")
	// If path starts with /, remove it to avoid double slash with targetBase
	path = strings.TrimPrefix(path, "/")

	finalURL := targetBase + path

	// 3. Create Request
	// Read body
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, `{"success":false,"message":"Failed to read request body"}`)
		return
	}
	r.Body.Close() // Close original body

	proxyReq, err := http.NewRequest(r.Method, finalURL, bytes.NewBuffer(body))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, `{"success":false,"message":"Failed to create proxy request"}`)
		return
	}

	// 4. Add Headers
	proxyReq.Header.Set("Authorization", "Bearer "+tokenString)
	proxyReq.Header.Set("Content-Type", "application/json")

	// 5. Send Request
	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `{"success":false,"message":"Failed to connect to simulation server: %v"}`, err)
		return
	}
	defer resp.Body.Close()

	// 6. Copy Response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
