package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
)

// EC2StatusResponse represents the response from EC2 status endpoint
type EC2StatusResponse struct {
	InstanceID string `json:"instance_id"`
	State      string `json:"state"`
	PublicIP   string `json:"public_ip,omitempty"`
	Region     string `json:"region"`
}

// getEC2Client creates an EC2 client with credentials from config
func (as *Server) getEC2Client() (*ec2.Client, error) {
	cfg := as.config.EC2

	if cfg.AWSAccessKeyID == "" || cfg.AWSSecretAccessKey == "" {
		return nil, fmt.Errorf("AWS credentials not configured in config.json")
	}

	awsCfg := aws.Config{
		Region: cfg.AWSRegion,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AWSAccessKeyID,
			cfg.AWSSecretAccessKey,
			"",
		),
	}

	client := ec2.NewFromConfig(awsCfg)
	return client, nil
}

// GetEC2Status returns the current status of the EC2 instance
func (as *Server) GetEC2Status(w http.ResponseWriter, r *http.Request) {
	client, err := as.getEC2Client()
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
		return
	}

	cfg := as.config.EC2
	ctx := context.Background()

	result, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to describe instance: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	if len(result.Reservations) == 0 || len(result.Reservations[0].Instances) == 0 {
		JSONResponse(w, models.Response{Success: false, Message: "Instance not found"}, http.StatusNotFound)
		return
	}

	instance := result.Reservations[0].Instances[0]
	response := EC2StatusResponse{
		InstanceID: cfg.InstanceID,
		State:      string(instance.State.Name),
		Region:     cfg.AWSRegion,
	}

	if instance.PublicIpAddress != nil {
		response.PublicIP = *instance.PublicIpAddress
	}

	JSONResponse(w, models.Response{
		Success: true,
		Message: "Instance status retrieved",
		Data:    response,
	}, http.StatusOK)
}

// StartEC2Instance starts the EC2 instance and optionally starts evil
func (as *Server) StartEC2Instance(w http.ResponseWriter, r *http.Request) {
	var req struct {
		StartEvilginx  bool   `json:"start_evil"`
		Domain         string `json:"domain"`
		IgnoreThrottle bool   `json:"ignore_throttle"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	client, err := as.getEC2Client()
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
		return
	}

	cfg := as.config.EC2
	ctx := context.Background()

	// Check if we need to throttle (24-hour rule)
	if !req.IgnoreThrottle {
		allowed, err := models.IsEC2SyncAllowed("templates_auto_start")
		if err == nil && !allowed {
			// Check if it's already running. If so, we can continue without starting.
			status, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
				InstanceIds: []string{cfg.InstanceID},
			})
			if err == nil && len(status.Reservations) > 0 && len(status.Reservations[0].Instances) > 0 {
				state := status.Reservations[0].Instances[0].State.Name
				if state != types.InstanceStateNameRunning && state != types.InstanceStateNamePending {
					JSONResponse(w, models.Response{
						Success: false,
						Message: "EC2 auto-start is throttled (24-hour limit). Please start manually or wait.",
					}, http.StatusTooManyRequests)
					return
				}
				// If running, we just fall through to the "already started" logic below
			}
		}
	}

	// Start the instance
	_, err = client.StartInstances(ctx, &ec2.StartInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil {
		// Log error but check if it's because it's already running/pending
		if !strings.Contains(err.Error(), "IncorrectInstanceState") {
			JSONResponse(w, models.Response{Success: false, Message: "Failed to start instance: " + err.Error()}, http.StatusInternalServerError)
			return
		}
	}

	// Update sync log only if we triggered it via templates (not ignored)
	if !req.IgnoreThrottle {
		models.UpdateEC2Sync("templates_auto_start", "success")
	}

	// Wait for running state
	waiter := ec2.NewInstanceRunningWaiter(client)
	err = waiter.Wait(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	}, 5*time.Minute)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Instance started but wait failed: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	// Get the public IP
	result, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil || len(result.Reservations) == 0 || len(result.Reservations[0].Instances) == 0 {
		JSONResponse(w, models.Response{Success: false, Message: "Instance started but could not retrieve details"}, http.StatusInternalServerError)
		return
	}

	instance := result.Reservations[0].Instances[0]
	publicIP := ""
	if instance.PublicIpAddress != nil {
		publicIP = *instance.PublicIpAddress
		// Store the EC2 IP in database for secure access
		models.SetSimulationConfig("ec2_public_ip", publicIP)
	}

	// Optionally start evil via SSH
	sshMessage := ""
	if req.StartEvilginx && publicIP != "" {
		// Use request domain or fallback to config
		domain := req.Domain
		if domain == "" {
			if u, err := url.Parse(as.config.SimulationServerURL); err == nil {
				domain = u.Hostname()
			}
		}

		// Sync Cloudflare DNS
		if token := as.config.CloudflareToken; token != "" && domain != "" {
			// User asked to "wait until request got completed". So we should NOT run in goroutine or wait for it.
			if err := as.SyncCloudflareDNS(domain, publicIP, token); err != nil {
				sshMessage += fmt.Sprintf(" | DNS Sync Error: %v", err)
			} else {
				sshMessage += " | DNS Synced"
			}
		}

		sshMessage += " | " + as.startEvilginxViaSSH(publicIP, domain)

		// Update Remote IPv4 Config
		if err := as.UpdateRemoteIPv4(publicIP); err != nil {
			sshMessage += fmt.Sprintf(" | IPv4 Update Error: %v", err)
		} else {
			sshMessage += " | IPv4 Updated"
		}
		
	}

	response := map[string]interface{}{
		"instance_id": cfg.InstanceID,
		"state":       string(instance.State.Name),
		"public_ip":   publicIP,
		"ssh_result":  sshMessage,
	}

	// Record the start time in the database for the auto-shutdown scheduler
	models.SetEC2StartTime(time.Now().UTC())

	// Force refresh redirector and module caches now that EC2 is up
	as.RefreshAllCaches()

	JSONResponse(w, models.Response{
		Success: true,
		Message: "EC2 instance started successfully",
		Data:    response,
	}, http.StatusOK)
}

// startEvilginxViaSSH connects to the EC2 instance and starts evil in a screen session
func (as *Server) startEvilginxViaSSH(publicIP string, domain string) string {
	cfg := as.config.EC2

	// Wait for SSH to be ready (max 2 minutes)
	sshReady := false
	for i := 0; i < 24; i++ {
		cmd := exec.Command("ssh",
			"-o", "StrictHostKeyChecking=no",
			"-o", "BatchMode=yes",
			"-o", "ConnectTimeout=5",
			"-i", cfg.SSHKeyPath,
			fmt.Sprintf("%s@%s", cfg.SSHUser, publicIP),
			"echo ok",
		)
		if err := cmd.Run(); err == nil {
			sshReady = true
			break
		}
		time.Sleep(5 * time.Second)
	}

	if !sshReady {
		return "SSH not ready after 2 minutes"
	}

	// Construct command with domain if provided
	runCmd := "sudo ./truststrike -gui -gui-https"
	if domain != "" {
		runCmd += fmt.Sprintf(" -gui-domain %s", domain)
	}

	// Start evil in screen
	sshCmd := fmt.Sprintf(`cd "%s" && if screen -list | grep -q "\.%s"; then screen -S "%s" -X quit; fi && screen -dmS "%s" bash -c "%s"`,
		cfg.RemoteDir, cfg.ScreenName, cfg.ScreenName, cfg.ScreenName, runCmd)

	cmd := exec.Command("ssh",
		"-o", "StrictHostKeyChecking=no",
		"-i", cfg.SSHKeyPath,
		fmt.Sprintf("%s@%s", cfg.SSHUser, publicIP),
		sshCmd,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Sprintf("SSH command failed: %s - %s", err.Error(), strings.TrimSpace(string(output)))
	}

	return "evil started in screen session: " + cfg.ScreenName
}

// StopEC2Instance stops the EC2 instance
func (as *Server) StopEC2Instance(w http.ResponseWriter, r *http.Request) {
	err := as.internalStopEC2()
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
		return
	}

	cfg := as.config.EC2
	JSONResponse(w, models.Response{
		Success: true,
		Message: "EC2 instance stopped successfully",
		Data: map[string]interface{}{
			"instance_id": cfg.InstanceID,
			"state":       string(types.InstanceStateNameStopped),
		},
	}, http.StatusOK)
}

// internalStartEC2 starts the EC2 instance without waiting for it to be ready
func (as *Server) internalStartEC2() (*ec2.Client, error) {
	// ALWAYS reset the start time first to prevent scheduler from shutting down
	// while user is actively configuring a campaign.
	models.SetEC2StartTime(time.Now().UTC())

	client, err := as.getEC2Client()
	if err != nil {
		return nil, err
	}

	cfg := as.config.EC2
	ctx := context.Background()

	// Start the instance
	_, err = client.StartInstances(ctx, &ec2.StartInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil {
		// If it's already running/pending, we don't treat it as a hard error for start logic
		if !strings.Contains(err.Error(), "IncorrectInstanceState") {
			return nil, fmt.Errorf("failed to trigger start: %w", err)
		}
	}

	return client, nil
}

// internalStopEC2 is the core logic to stop the EC2 instance without HTTP dependency
func (as *Server) internalStopEC2() error {
	client, err := as.getEC2Client()
	if err != nil {
		return err
	}

	cfg := as.config.EC2
	ctx := context.Background()

	// Stop the instance
	_, err = client.StopInstances(ctx, &ec2.StopInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil {
		// Ignore if already stopped or stopping
		if strings.Contains(err.Error(), "IncorrectInstanceState") {
			log.Infof("EC2 instance already stopping or stopped: %s", cfg.InstanceID)
			return nil
		}
		return fmt.Errorf("failed to stop instance: %w", err)
	}

	// Wait for stopped state
	waiter := ec2.NewInstanceStoppedWaiter(client)
	err = waiter.Wait(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	}, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("instance stopping but wait failed: %w", err)
	}

	// Clear the start time when stopped
	models.SetSimulationConfig(models.ConfigKeyEC2StartTime, "")

	return nil
}

// StartEC2ShutdownScheduler runs a background goroutine that checks if EC2 should be shut down
func (as *Server) StartEC2ShutdownScheduler() {
	log.Info("Starting EC2 auto-shutdown scheduler")
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			as.checkEC2Shutdown()
		}
	}()
}

func (as *Server) checkEC2Shutdown() {
	startTime, err := models.GetEC2StartTime()
	if err != nil || startTime.IsZero() {
		return // Not started or error reading
	}

	// Check if 60 minutes have passed
	if time.Since(startTime) < 60*time.Minute {
		return
	}

	// Verify instance is actually running before proceeding
	client, err := as.getEC2Client()
	if err != nil {
		return
	}

	cfg := as.config.EC2
	ctx := context.Background()
	result, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil || len(result.Reservations) == 0 || len(result.Reservations[0].Instances) == 0 {
		return
	}

	instance := result.Reservations[0].Instances[0]
	if instance.State.Name != types.InstanceStateNameRunning {
		// Not running, clear start time if it was erroneously set
		if instance.State.Name == types.InstanceStateNameStopped {
			models.SetSimulationConfig(models.ConfigKeyEC2StartTime, "")
		}
		return
	}

	// Check for active campaigns
	hasActive, err := models.HasActiveCampaigns()
	if err != nil {
		log.Errorf("EC2 Scheduler: Error checking for active campaigns: %v", err)
		return // Erring on side of caution
	}

	if hasActive {
		// log.Debug("EC2 Scheduler: Active campaigns found, skipping auto-shutdown")
		return
	}

	log.Infof("EC2 Scheduler: Auto-stopping EC2 instance %s (60 minute limit reached with no active campaigns)", cfg.InstanceID)
	err = as.internalStopEC2()
	if err != nil {
		log.Errorf("EC2 Scheduler: Failed to auto-stop instance: %v", err)
	}
}


