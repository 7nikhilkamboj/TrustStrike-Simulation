package api

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/mail"
	"os"
	"strings"
	"time"

	"net/http"

	"github.com/7nikhilkamboj/TrustStrike-Simulation/auth"
	ctx "github.com/7nikhilkamboj/TrustStrike-Simulation/context"
	log "github.com/7nikhilkamboj/TrustStrike-Simulation/logger"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/models"
	"github.com/7nikhilkamboj/TrustStrike-Simulation/util"
	"github.com/gorilla/mux"
)

// UploadBulkCSV handles uploading the file and returning a preview
func (as *Server) UploadBulkCSV(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form (32MB max memory)
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Error parsing form provided"}, http.StatusBadRequest)
		return
	}

	// Get file
	file, _, err := r.FormFile("file")
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Error retrieving file"}, http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Save file to temp location
	// We use a token as the filename to reference it later
	token := auth.GenerateSecureKey(16)
	tempFilename := os.TempDir() + string(os.PathSeparator) + "import_" + token + ".csv"

	tempFile, err := os.Create(tempFilename)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Error creating temp file"}, http.StatusInternalServerError)
		return
	}
	// Copy uploaded file to temp file
	_, err = io.Copy(tempFile, file)
	tempFile.Close() // Close to flush
	if err != nil {
		os.Remove(tempFilename)
		JSONResponse(w, models.Response{Success: false, Message: "Error saving temp file"}, http.StatusInternalServerError)
		return
	}

	// Read Preview
	f, err := os.Open(tempFilename)
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Error reading saved file"}, http.StatusInternalServerError)
		return
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true

	// Read header
	header, err := reader.Read()
	if err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Failed to read CSV header"}, http.StatusBadRequest)
		return
	}

	// Identify columns
	cols := map[string]int{"first_name": -1, "last_name": -1, "email": -1, "position": -1}
	for i, h := range header {
		h = strings.ToLower(strings.TrimSpace(h))
		if strings.Contains(h, "first") && strings.Contains(h, "name") {
			cols["first_name"] = i
		}
		if strings.Contains(h, "last") && strings.Contains(h, "name") {
			cols["last_name"] = i
		}
		if strings.Contains(h, "email") {
			cols["email"] = i
		}
		if strings.Contains(h, "position") {
			cols["position"] = i
		}
	}

	if cols["email"] == -1 {
		JSONResponse(w, models.Response{Success: false, Message: "CSV missing required 'Email' column"}, http.StatusBadRequest)
		return
	}

	preview := []models.Target{}
	count := 0
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		count++

		if len(preview) < 50 {
			t := models.Target{}
			if idx := cols["first_name"]; idx != -1 && len(record) > idx {
				t.FirstName = record[idx]
			}
			if idx := cols["last_name"]; idx != -1 && len(record) > idx {
				t.LastName = record[idx]
			}
			if idx := cols["email"]; idx != -1 && len(record) > idx {
				t.Email = record[idx]
			}
			if idx := cols["position"]; idx != -1 && len(record) > idx {
				t.Position = record[idx]
			}
			preview = append(preview, t)
		}
	}

	JSONResponse(w, map[string]interface{}{
		"success":     true,
		"file_token":  token,
		"preview":     preview,
		"total_count": count,
		"message":     fmt.Sprintf("File uploaded. %d records found.", count),
	}, http.StatusOK)
}

// CommitBulkImport starts the background import job
func (as *Server) CommitBulkImport(w http.ResponseWriter, r *http.Request) {
	req := struct {
		Name      string `json:"name"`
		GroupType string `json:"group_type"`
		GroupId   int64  `json:"group_id"`
		FileToken string `json:"file_token"`
	}{}
	if err := util.ParseJSON(r, &req); err != nil {
		JSONResponse(w, models.Response{Success: false, Message: "Invalid request format"}, http.StatusBadRequest)
		return
	}

	if req.FileToken == "" {
		JSONResponse(w, models.Response{Success: false, Message: "File token is required"}, http.StatusBadRequest)
		return
	}

	tempFilename := os.TempDir() + string(os.PathSeparator) + "import_" + req.FileToken + ".csv"
	if _, err := os.Stat(tempFilename); os.IsNotExist(err) {
		JSONResponse(w, models.Response{Success: false, Message: "Import file expired or not found"}, http.StatusNotFound)
		return
	}

	// Create Group if needed
	var groupID int64 = req.GroupId
	user := ctx.Get(r, "user").(models.User)

	// If no ID provided, try to find by name to avoid duplicates and allow updating type
	if groupID == 0 && req.Name != "" {
		if existing, err := models.GetGroupByName(req.Name, user.Id); err == nil {
			groupID = existing.Id
		}
	}

	if groupID == 0 {
		if req.Name == "" {
			req.Name = "Imported Group " + time.Now().Format("2006-01-02 15:04:05")
		}
		newGroup := &models.Group{
			Name:         req.Name,
			GroupType:    req.GroupType,
			UserId:       user.Id,
			ModifiedDate: time.Now(),
			IsActive:     false,
		}
		if err := models.CreateGroupShell(newGroup); err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		groupID = newGroup.Id
	} else {
		// Update existing group type and modified date
		// We use a map to ensure only these fields are updated
		updates := map[string]interface{}{
			"group_type":    req.GroupType,
			"modified_date": time.Now(),
		}
		if req.Name != "" {
			updates["name"] = req.Name
		}
		models.UpdateGroupFields(groupID, updates)
	}

	// Create Job
	jobID := auth.GenerateSecureKey(8)
	job := models.GlobalJobManager.CreateJob(jobID, user.Id, models.JobTypeImport)

	// Start Background Worker
	isNewGroup := req.GroupId == 0 && groupID != 0
	go processBulkImport(job, tempFilename, groupID, isNewGroup)

	JSONResponse(w, map[string]interface{}{
		"success":  true,
		"job_id":   jobID,
		"group_id": groupID,
	}, http.StatusOK)
}

func processBulkImport(job *models.Job, filename string, groupID int64, isNewGroup bool) {
	defer os.Remove(filename) // Cleanup after done

	file, err := os.Open(filename)
	if err != nil {
		job.Fail("Failed to open file: " + err.Error())
		return
	}
	defer file.Close()

	// 1. Initial Pass: Count total lines
	lineCount := 0
	lineReader := csv.NewReader(file)
	for {
		_, err := lineReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		lineCount++
	}
	file.Close()

	// Re-open for processing
	file, err = os.Open(filename)
	if err != nil {
		job.Fail("Failed to re-open file: " + err.Error())
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true

	// Read header to identify columns
	header, err := reader.Read()
	if err != nil {
		job.Fail("Failed to read CSV header: " + err.Error())
		return
	}

	// Subtract header from total
	totalRecords := int64(lineCount - 1)
	if totalRecords < 0 {
		totalRecords = 0
	}
	// Update job total immediately
	job.UpdateProgress(0, totalRecords)

	cols := map[string]int{
		"first_name": -1,
		"last_name":  -1,
		"email":      -1,
		"position":   -1,
	}

	for i, h := range header {
		h = strings.ToLower(strings.TrimSpace(h))
		if strings.Contains(h, "first") && strings.Contains(h, "name") {
			cols["first_name"] = i
		}
		if strings.Contains(h, "last") && strings.Contains(h, "name") {
			cols["last_name"] = i
		}
		if strings.Contains(h, "email") {
			cols["email"] = i
		}
		if strings.Contains(h, "position") {
			cols["position"] = i
		}
	}

	if cols["email"] == -1 {
		job.Fail("CSV missing required 'Email' column")
		return
	}

	batchSize := 1000
	var batch []models.Target
	var processedRecords int64 = 0
	var importedCount int64 = 0
	var duplicateCount int64 = 0

	// Track IDs for atomic cleanup on cancellation
	allAddedTargets := []int64{}
	allAddedLinks := []int64{}

	// Map to track duplicates within the file
	seenEmails := make(map[string]bool)

	startTime := time.Now()

	for {
		// Check for cancellation
		if processedRecords%10 == 0 && job.IsCancelled() {
			log.Infof("Bulk import job %s cancelled. Cleaning up %d targets and %d links.", job.ID, len(allAddedTargets), len(allAddedLinks))
			models.CleanupImport(allAddedTargets, groupID, allAddedLinks)
			if isNewGroup {
				log.Infof("Deleting new group shell %d for cancelled job %s", groupID, job.ID)
				models.DeleteGroup(groupID, 0) // 0 uid bypasses check
			}
			return
		}

		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			job.AddError("Error reading line: " + err.Error())
			processedRecords++
			continue
		}

		processedRecords++

		// Extract data
		t := models.Target{}
		if idx := cols["first_name"]; idx != -1 && len(record) > idx {
			t.FirstName = record[idx]
		}
		if idx := cols["last_name"]; idx != -1 && len(record) > idx {
			t.LastName = record[idx]
		}
		if idx := cols["email"]; idx != -1 && len(record) > idx {
			// Parse email to ensure valid
			e, err := mail.ParseAddress(record[idx])
			if err == nil {
				t.Email = e.Address
			} else {
				continue // Skip invalid emails silently or log?
			}
		} else {
			continue // No email
		}
		if idx := cols["position"]; idx != -1 && len(record) > idx {
			t.Position = record[idx]
		}

		// Check for duplicate in this file
		if seenEmails[t.Email] {
			duplicateCount++
			if processedRecords%100 == 0 {
				job.UpdateProgress(processedRecords, totalRecords)
			}
			continue
		}
		seenEmails[t.Email] = true

		batch = append(batch, t)

		if len(batch) >= batchSize {
			addedTargets, addedLinks, err := models.BulkInsertTargets(groupID, batch)
			if err != nil {
				job.AddError("Batch insert failed: " + err.Error())
			} else {
				importedCount += int64(len(batch))
				allAddedTargets = append(allAddedTargets, addedTargets...)
				allAddedLinks = append(allAddedLinks, addedLinks...)
			}
			job.UpdateProgress(processedRecords, totalRecords)
			batch = nil // Clear batch
			// PERFORMANCE: Yield CPU and DB locks to keep system responsive
			time.Sleep(10 * time.Millisecond)
		}
	}

	// Insert remaining
	if len(batch) > 0 {
		addedTargets, addedLinks, err := models.BulkInsertTargets(groupID, batch)
		if err != nil {
			job.AddError("Final batch insert failed: " + err.Error())
		} else {
			importedCount += int64(len(batch))
			allAddedTargets = append(allAddedTargets, addedTargets...)
			allAddedLinks = append(allAddedLinks, addedLinks...)
		}
		job.UpdateProgress(processedRecords, totalRecords)
	}

	// FINAL CHECK: If user cancelled at the very last second, scrub everything!
	if job.IsCancelled() {
		log.Infof("Bulk import job %s cancelled during finalization. Cleaning up %d targets and %d links.", job.ID, len(allAddedTargets), len(allAddedLinks))
		models.CleanupImport(allAddedTargets, groupID, allAddedLinks)
		if isNewGroup {
			log.Infof("Deleting new group shell %d for job %s cancelled at last second", groupID, job.ID)
			models.DeleteGroup(groupID, 0)
		}
		return
	}

	// ACTIVATE GROUP: Now that import is complete, make it visible
	err = models.UpdateGroupFields(groupID, map[string]interface{}{"is_active": true})
	if err != nil {
		log.Errorf("Failed to activate group %d after import: %v", groupID, err)
		job.AddError("Import finished but failed to activate group in list. Please contact admin.")
	}

	duration := time.Since(startTime)
	resultMsg := fmt.Sprintf("Imported %d targets in %s", importedCount, duration)
	job.Complete(resultMsg)
	log.Infof("Bulk import job %s completed: %s", job.ID, resultMsg)
}

// CancelBulkImport cancels a running bulk import job
func (as *Server) CancelBulkImport(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	job, ok := models.GlobalJobManager.GetJob(id)
	if !ok {
		JSONResponse(w, models.Response{Success: false, Message: "Job not found"}, http.StatusNotFound)
		return
	}

	job.Cancel()
	JSONResponse(w, models.Response{Success: true, Message: "Job cancellation requested"}, http.StatusOK)
}

// GetActiveJobs returns all active jobs for the current user
func (as *Server) GetActiveJobs(w http.ResponseWriter, r *http.Request) {
	user := ctx.Get(r, "user").(models.User)
	jobs := models.GlobalJobManager.GetActiveJobs(user.Id)
	JSONResponse(w, jobs, http.StatusOK)
}

// GetJobStatus returns the status of a job
func (as *Server) GetJobStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	job, ok := models.GlobalJobManager.GetJob(id)
	if !ok {
		JSONResponse(w, models.Response{Success: false, Message: "Job not found"}, http.StatusNotFound)
		return
	}

	// We return the raw job struct
	JSONResponse(w, job, http.StatusOK)
}
