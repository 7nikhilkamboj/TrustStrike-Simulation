package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/trust_strike/trust_strike/models"
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
		StartEvilginx bool `json:"start_evil"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	client, err := as.getEC2Client()
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
		return
	}

	cfg := as.config.EC2
	ctx := context.Background()

	// Start the instance
	_, err = client.StartInstances(ctx, &ec2.StartInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to start instance: " + err.Error()}, http.StatusInternalServerError)
		return
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
		sshMessage = as.startEvilginxViaSSH(publicIP)
	}

	response := map[string]interface{}{
		"instance_id": cfg.InstanceID,
		"state":       string(instance.State.Name),
		"public_ip":   publicIP,
		"ssh_result":  sshMessage,
	}

	JSONResponse(w, models.Response{
		Success: true,
		Message: "EC2 instance started successfully",
		Data:    response,
	}, http.StatusOK)
}

// startEvilginxViaSSH connects to the EC2 instance and starts evil in a screen session
func (as *Server) startEvilginxViaSSH(publicIP string) string {
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

	// Start evil in screen
	sshCmd := fmt.Sprintf(`cd "%s" && if screen -list | grep -q "\.%s"; then screen -S "%s" -X quit; fi && screen -dmS "%s" bash -c "sudo ./truststrike -gui"`,
		cfg.RemoteDir, cfg.ScreenName, cfg.ScreenName, cfg.ScreenName)

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
	client, err := as.getEC2Client()
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
		return
	}

	cfg := as.config.EC2
	ctx := context.Background()

	// Stop the instance
	_, err = client.StopInstances(ctx, &ec2.StopInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	})
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to stop instance: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	// Wait for stopped state
	waiter := ec2.NewInstanceStoppedWaiter(client)
	err = waiter.Wait(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{cfg.InstanceID},
	}, 5*time.Minute)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Instance stopping but wait failed: " + err.Error()}, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, models.Response{
		Success: true,
		Message: "EC2 instance stopped successfully",
		Data: map[string]interface{}{
			"instance_id": cfg.InstanceID,
			"state":       string(types.InstanceStateNameStopped),
		},
	}, http.StatusOK)
}
