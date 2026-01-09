package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/trust_strike/trust_strike/auth"
	"github.com/trust_strike/trust_strike/models"
)

const (
	CLOUDFLARE_URL = "https://api.cloudflare.com"
)

// CallSimulationServer makes an authenticated call to the TrustStrike server
func (as *Server) CallSimulationServer(campaign string) error {
	// 1. Generate the JWT
	tokenString, err := auth.GenerateToken(1, "system_admin", "admin")
	if err != nil {
		return err
	}

	// 2. Create the Request
	url := as.config.SimulationServerURL + "strikes/create"
	jsonBody, err := json.Marshal(map[string]string{
		"campaign": campaign,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}

	// 3. Add the Authorization Header
	req.Header.Set("Authorization", "Bearer "+tokenString)
	req.Header.Set("Content-Type", "application/json")

	// 4. Send the Request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API call failed with status: %s", resp.Status)
	}

	return nil
}

// TriggerStrike handles the API request to trigger a strike
func (as *Server) TriggerStrike(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Campaign string `json:"campaign"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request body"}, http.StatusBadRequest)
		return
	}

	if req.Campaign == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Campaign name is required"}, http.StatusBadRequest)
		return
	}

	err := as.CallSimulationServer(req.Campaign)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to trigger strike: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{Success: true, Message: "Strike triggered successfully"}, http.StatusOK)
}

// Strike definition
type Strike struct {
	ID          int    `json:"id"`
	URL         string `json:"url"`
	RedirectURL string `json:"redirect_url"`
	Module      string `json:"module"`
	LurPath     string `json:"lure_path"`
	Redirector  string `json:"redirector"`
	LandingUrl  string `json:"landing_url"`
}

type Config struct {
	Domain           string `json:"domain"`
	IPv4             string `json:"external_ipv4"`
	UnauthURL        string `json:"unauth_url"`
	GophishAdminURL  string `json:"gophish_admin_url"`
	GophishAdmin_key string `json:"gophish_api_key"`
	GophishInsecure  bool   `json:"gophish_insecure"`
}
type CloudflareConfig struct {
	NS1        string   `json:"ns1"`
	NS2        string   `json:"ns2"`
	DNSRecords []string `json:"dns_records"`
	// CloudflareToken string   `json:"cloudflare_token"`
	Status string `json:"status"`
}

type CloudflareZone struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	// Paused      bool     `json:"paused"`
	// Type        string   `json:"type"`
	NameServers []string `json:"name_servers"`
}

type CloudflareZonesResponse struct {
	Result  []CloudflareZone `json:"result"`
	Success bool             `json:"success"`
}

type CloudflareAccountResponse struct {
	Result []struct {
		ID string `json:"id"`
	} `json:"result"`
	Success bool `json:"success"`
}

type CloudflareDNSRecord struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Content string `json:"content"`
	TTL     int    `json:"ttl"`
	Proxied bool   `json:"proxied"`
}

type CloudflareDNSRecordsResponse struct {
	Result  []CloudflareDNSRecord `json:"result"`
	Success bool                  `json:"success"`
}

// GetStrikes proxies the request to get all strikes
func (as *Server) GetStrikes(w http.ResponseWriter, r *http.Request) {
	strikes, err := as.fetchStrikes()
	if err != nil {
		fmt.Println(err)
		JSONResponse(w, models.Response{Success: false, Message: "Server offline"}, http.StatusInternalServerError)
		return
	}

	JSONResponse(
		w,
		models.Response{
			Success: true,
			Message: "Strikes retrieved successfully",
			Data:    strikes,
		},
		http.StatusOK,
	)
}

// GetAllDomains is the API handler to fetch all domains
func (as *Server) FetchAllDomains(w http.ResponseWriter, r *http.Request) {
	token, err := models.GetSimulationConfig("cloudflare_token")
	if err != nil || token == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Cloudflare token not configured"}, http.StatusBadRequest)
		return
	}

	zones, err := as.GetDomainsList(token)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to fetch domains: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{
		Success: true,
		Message: "Domains retrieved successfully",
		Data:    zones,
	}, http.StatusOK)
}

func (as *Server) fetchCloudflareConfig(domain string) (*CloudflareConfig, error) {
	token, err := models.GetSimulationConfig("cloudflare_token")
	if err != nil {
		return nil, err
	}

	config := &CloudflareConfig{
		// CloudflareToken: token,
	}

	if domain != "" && token != "" {
		cfInfo, err := as.GetDNSRecords(domain, token)
		if err == nil && cfInfo != nil {
			config.NS1 = cfInfo.NS1
			config.NS2 = cfInfo.NS2
			config.DNSRecords = cfInfo.DNSRecords
			config.Status = cfInfo.Status
		}
	}

	return config, nil
}

func (as *Server) GetConfig(w http.ResponseWriter, r *http.Request) {
	config, err := as.fetchConfig()
	if err != nil {
		fmt.Println(err)
		JSONResponse(w, models.Response{Success: false, Message: "Server offline"}, http.StatusInternalServerError)
		return
	}

	JSONResponse(
		w,
		models.Response{
			Success: true,
			Message: "Config retrieved successfully",
			Data:    config,
		},
		http.StatusOK,
	)
}

// GetModules proxies the request to get available modules
func (as *Server) GetModules(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "modules"
	proxyRequest(w, "GET", url, nil)
}

// CreateStrike proxies the request to create a new strike
func (as *Server) CreateStrike(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "strikes/create"
	proxyRequest(w, "POST", url, r.Body)
}

// EditStrike proxies the request to edit a strike
func (as *Server) EditStrike(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	// Resolve actual index from ID
	index, err := as.resolveIndexFromID(id)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Server offline"}, http.StatusNotFound)
		return
	}

	url := fmt.Sprintf("%sstrikes/%d/edit", as.config.SimulationServerURL, index)
	proxyRequest(w, "POST", url, r.Body)
}

// DeleteStrike proxies the request to delete a strike
func (as *Server) DeleteStrike(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	// Resolve actual index from ID
	index, err := as.resolveIndexFromID(id)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Server offline"}, http.StatusNotFound)
		return
	}

	url := fmt.Sprintf("%sstrikes/%d", as.config.SimulationServerURL, index)
	proxyRequest(w, "DELETE", url, nil)
}

// fetchStrikes gets the list of strikes from the simulation server
func (as *Server) fetchStrikes() ([]Strike, error) {
	url := as.config.SimulationServerURL + "strikes"
	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	// Add JWT Authorization header
	tokenString, err := auth.GenerateToken(1, "system_admin", "admin")
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tokenString)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var strikes []Strike
	if err := json.Unmarshal(body, &strikes); err != nil {
		return nil, err
	}
	return strikes, nil
}

type CloudflareSingleZoneResponse struct {
	Result []struct {
		ID          string   `json:"id"`
		NameServers []string `json:"name_servers"`
		Status      string   `json:"status"`
	} `json:"result"`
	Success bool `json:"success"`
}

func (as *Server) GetCloudflareConfig(w http.ResponseWriter, r *http.Request) {
	domain := r.URL.Query().Get("domain")
	config, err := as.fetchCloudflareConfig(domain)
	if err != nil {
		JSONResponse(w, models.Response{
			Success: false,
			Message: "Failed to fetch config: " + err.Error(),
		}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{
		Success: true,
		Message: "Config retrieved successfully",
		Data:    config,
	}, http.StatusOK)
}

func (as *Server) GetDNSRecords(domain string, token string) (*CloudflareConfig, error) {
	url := fmt.Sprintf("%s/client/v4/zones?name=%s", CLOUDFLARE_URL, domain)
	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var cfResp CloudflareSingleZoneResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		return nil, err
	}

	if !cfResp.Success || len(cfResp.Result) == 0 {
		cfConfig := &CloudflareConfig{
			Status: "error",
			// CloudflareToken: token,
		}
		return cfConfig, nil
	}

	cfConfig := &CloudflareConfig{
		Status: cfResp.Result[0].Status,
	}
	if len(cfResp.Result[0].NameServers) > 0 {
		cfConfig.NS1 = cfResp.Result[0].NameServers[0]
		// cfConfig.CloudflareToken = token
		if len(cfResp.Result[0].NameServers) > 1 {
			cfConfig.NS2 = cfResp.Result[0].NameServers[1]
		}
		cfConfig.DNSRecords = cfResp.Result[0].NameServers
	}

	return cfConfig, nil
}

// LIST ALL DOMAINS LISTS

func (as *Server) GetDomainsList(token string) ([]CloudflareZone, error) {
	url := CLOUDFLARE_URL + "/client/v4/zones"
	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var zonesResp CloudflareZonesResponse
	if err := json.NewDecoder(resp.Body).Decode(&zonesResp); err != nil {
		return nil, err
	}

	if !zonesResp.Success {
		return nil, fmt.Errorf("Cloudflare API error")
	}

	return zonesResp.Result, nil
}

func (as *Server) FetchDNSRecords(w http.ResponseWriter, r *http.Request) {
	zoneID := r.URL.Query().Get("zone_id")
	if zoneID == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Zone ID is required"}, http.StatusBadRequest)
		return
	}

	token, err := models.GetSimulationConfig("cloudflare_token")
	if err != nil || token == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Cloudflare token not configured"}, http.StatusBadRequest)
		return
	}

	records, err := as.GetCloudflareDNSRecords(zoneID, token)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to fetch DNS records: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{
		Success: true,
		Message: "DNS records retrieved successfully",
		Data:    records,
	}, http.StatusOK)
}

func (as *Server) GetCloudflareDNSRecords(zoneID string, token string) ([]CloudflareDNSRecord, error) {
	url := fmt.Sprintf("%s/client/v4/zones/%s/dns_records", CLOUDFLARE_URL, zoneID)
	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var recordsResp CloudflareDNSRecordsResponse
	if err := json.NewDecoder(resp.Body).Decode(&recordsResp); err != nil {
		return nil, err
	}

	if !recordsResp.Success {
		return nil, fmt.Errorf("Cloudflare API error")
	}

	var filtered []CloudflareDNSRecord
	for _, r := range recordsResp.Result {
		if r.Type == "A" {
			filtered = append(filtered, r)
		}
	}

	return filtered, nil
}

func (as *Server) CreateDNSRecord(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ZoneID  string `json:"zone_id"`
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request body"}, http.StatusBadRequest)
		return
	}

	token, err := models.GetSimulationConfig("cloudflare_token")
	if err != nil || token == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Cloudflare token not configured"}, http.StatusBadRequest)
		return
	}

	err = as.CreateCloudflareDNSRecord(req.ZoneID, req.Name, req.Content, token)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to create DNS record: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{Success: true, Message: "DNS record created successfully"}, http.StatusOK)
}

func (as *Server) CreateCloudflareDNSRecord(zoneID, name, content, token string) error {
	url := fmt.Sprintf("%s/client/v4/zones/%s/dns_records", CLOUDFLARE_URL, zoneID)
	client := &http.Client{}

	data := map[string]interface{}{
		"type":    "A",
		"name":    name,
		"content": content,
		"ttl":     1, // 1 for automatic
		"proxied": true,
	}
	payload, _ := json.Marshal(data)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
		Errors  []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	if !result.Success {
		if len(result.Errors) > 0 {
			return fmt.Errorf(result.Errors[0].Message)
		}
		return fmt.Errorf("Cloudflare API error")
	}

	return nil
}

func (as *Server) DeleteDNSRecord(w http.ResponseWriter, r *http.Request) {
	zoneID := r.URL.Query().Get("zone_id")
	recordID := r.URL.Query().Get("record_id")

	if zoneID == "" || recordID == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Zone ID and Record ID are required"}, http.StatusBadRequest)
		return
	}

	token, err := models.GetSimulationConfig("cloudflare_token")
	if err != nil || token == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Cloudflare token not configured"}, http.StatusBadRequest)
		return
	}

	err = as.DeleteCloudflareDNSRecord(zoneID, recordID, token)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to delete DNS record: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{Success: true, Message: "DNS record deleted successfully"}, http.StatusOK)
}

func (as *Server) DeleteCloudflareDNSRecord(zoneID, recordID, token string) error {
	url := fmt.Sprintf("%s/client/v4/zones/%s/dns_records/%s", CLOUDFLARE_URL, zoneID, recordID)
	client := &http.Client{}

	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
		Errors  []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	if !result.Success {
		if len(result.Errors) > 0 {
			return fmt.Errorf(result.Errors[0].Message)
		}
		return fmt.Errorf("Cloudflare API error")
	}

	return nil
}

func (as *Server) SetupCloudflare(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request body"}, http.StatusBadRequest)
		return
	}

	token, err := models.GetSimulationConfig("cloudflare_token")
	if err != nil || token == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Cloudflare token not configured"}, http.StatusBadRequest)
		return
	}

	// 1. Get Account ID
	accountID, err := as.GetCloudflareAccountID(token)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to get Account ID: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	// 2. Create Zone (or it might already exist, try anyway)
	as.CreateCloudflareZone(req.Domain, accountID, token)

	// 3. Get Details
	cfConfig, err := as.GetDNSRecords(req.Domain, token)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to get DNS records: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{
		Success: true,
		Message: "Cloudflare setup completed",
		Data:    cfConfig,
	}, http.StatusOK)
}

func (as *Server) GetCloudflareAccountID(token string) (string, error) {
	url := CLOUDFLARE_URL + "/client/v4/accounts"
	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var accResp CloudflareAccountResponse
	if err := json.Unmarshal(body, &accResp); err != nil {
		return "", err
	}

	if !accResp.Success || len(accResp.Result) == 0 {
		return "", fmt.Errorf("no accounts found")
	}

	return accResp.Result[0].ID, nil
}

func (as *Server) CreateCloudflareZone(domain, accountID, token string) error {
	url := CLOUDFLARE_URL + "/client/v4/zones"
	client := &http.Client{}

	payload := map[string]interface{}{
		"name":       domain,
		"account":    map[string]string{"id": accountID},
		"jump_start": true,
	}
	jsonBody, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func (as *Server) fetchConfig() (*Config, error) {
	url := as.config.SimulationServerURL + "config"
	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	// Add JWT Authorization header
	tokenString, err := auth.GenerateToken(1, "system_admin", "admin")
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tokenString)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var config Config
	if err := json.Unmarshal(body, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// resolveIndexFromID finds the index of a strike with the given ID
func (as *Server) resolveIndexFromID(idStr string) (int, error) {
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return -1, fmt.Errorf("invalid ID format")
	}

	strikes, err := as.fetchStrikes()
	if err != nil {
		return -1, err
	}

	for i, strike := range strikes {
		if strike.ID == id {
			return i, nil
		}
	}

	return -1, fmt.Errorf("strike with ID %d not found", id)
}

// SetDomain proxies the request to set the domain
func (as *Server) SetDomain(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "config/domain"
	proxyRequest(w, "POST", url, r.Body)
}

// SetIPv4 proxies the request to set the external IPv4
func (as *Server) SetIPv4(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "config/ipv4"
	proxyRequest(w, "POST", url, r.Body)
}

// SetUnauthURL proxies the request to set the unauth URL
func (as *Server) SetUnauthURL(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "config/unauth_url"
	proxyRequest(w, "POST", url, r.Body)
}

// SetGophish proxies the request to set gophish configuration
func (as *Server) SetGophish(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "config/gophish"
	proxyRequest(w, "POST", url, r.Body)
}

// SetDNS proxies the request to set DNS configuration
func (as *Server) SetDNS(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "config/dns"
	proxyRequest(w, "POST", url, r.Body)
}

// SetPhishletHostname proxies the request to set the hostname for a phishlet
func (as *Server) SetPhishletHostname(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	url := fmt.Sprintf("%smodules/%s/hostname", as.config.SimulationServerURL, name)
	proxyRequest(w, "POST", url, r.Body)
}

// TogglePhishlet proxies the request to toggle a phishlet
func (as *Server) TogglePhishlet(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	url := fmt.Sprintf("%smodules/%s/toggle", as.config.SimulationServerURL, name)
	proxyRequest(w, "POST", url, nil)
}

// GetPhishletHosts proxies the request to get hosts for a phishlet
func (as *Server) GetPhishletHosts(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	url := fmt.Sprintf("%smodules/%s/hosts", as.config.SimulationServerURL, name)
	proxyRequest(w, "GET", url, nil)
}

// Cloudflare API's -------
func (as *Server) SetCloudflare(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request body"}, http.StatusBadRequest)
		return
	}

	if req.Token == "" {
		JSONResponse(w, models.Response{Success: false, Message: "Token is required"}, http.StatusBadRequest)
		return
	}

	err := models.SetSimulationConfig("cloudflare_token", req.Token)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to save token"}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{Success: true, Message: "Cloudflare token updated successfully"}, http.StatusOK)

	// token, _ := models.GetSimulationConfig("cloudflare_token")
	// config.CloudflareToken = token
}

// Helper function to proxy requests
func proxyRequest(w http.ResponseWriter, method, url string, body io.Reader) {
	client := &http.Client{}
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Server offline"}, http.StatusInternalServerError)
		return
	}

	req.Header.Set("Content-Type", "application/json")

	tokenString, err := auth.GenerateToken(1, "system_admin", "admin")

	// fmt.Println("TOKENNNNNNNNNNN", tokenString)

	if err == nil {
		req.Header.Set("Authorization", "Bearer "+tokenString)
	}

	resp, err := client.Do(req)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Server offline"}, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Server offline"}, http.StatusInternalServerError)
		return
	}

	// Forward the status code and body
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}

// GetRedirectors proxies the request to get all available redirectors
func (as *Server) GetRedirectors(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "redirectors"
	proxyRequest(w, "GET", url, nil)
}

// GetRedirector proxies the request to get a single redirector's details
func (as *Server) GetRedirector(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	url := fmt.Sprintf("%sredirectors/%s", as.config.SimulationServerURL, name)
	proxyRequest(w, "GET", url, nil)
}

// CreateRedirector proxies the request to create a new redirector
func (as *Server) CreateRedirector(w http.ResponseWriter, r *http.Request) {
	url := as.config.SimulationServerURL + "redirectors"
	proxyRequest(w, "POST", url, r.Body)
}

// DeleteRedirector proxies the request to delete a redirector
func (as *Server) DeleteRedirector(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	url := fmt.Sprintf("%sredirectors/%s", as.config.SimulationServerURL, name)
	proxyRequest(w, "DELETE", url, nil)
}

// UpdateRedirector proxies the request to update a redirector
func (as *Server) UpdateRedirector(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	url := fmt.Sprintf("%sredirectors/%s", as.config.SimulationServerURL, name)
	proxyRequest(w, "PUT", url, r.Body)
}

// SetPhishletLandingDomain proxies the request to set the landing domain for a phishlet
func (as *Server) SetPhishletLandingDomain(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	url := fmt.Sprintf("%smodules/%s/landing_domain", as.config.SimulationServerURL, name)
	proxyRequest(w, "POST", url, r.Body)
}
