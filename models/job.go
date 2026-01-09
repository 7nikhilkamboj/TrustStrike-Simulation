package models

import (
	"sync"
	"time"
)

// JobType represents the type of async job
type JobType string

const (
	JobTypeImport JobType = "import"
)

// JobStatus represents the current status of a job
type JobStatus string

const (
	JobStatusPending    JobStatus = "pending"
	JobStatusProcessing JobStatus = "processing"
	JobStatusCompleted  JobStatus = "completed"
	JobStatusFailed     JobStatus = "failed"
	JobStatusCancelled  JobStatus = "cancelled"
)

// Job represents an asynchronous task
type Job struct {
	ID        string    `json:"id"`
	UserId    int64     `json:"user_id"`
	Type      JobType   `json:"type"`
	Status    JobStatus `json:"status"`
	Total     int64     `json:"total"`
	Processed int64     `json:"processed"`
	Errors    []string  `json:"errors"`
	Result    string    `json:"result,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	mu        sync.Mutex
}

// JobManager handles the lifecycle of jobs
type JobManager struct {
	jobs map[string]*Job
	mu   sync.RWMutex
}

var GlobalJobManager *JobManager

func InitJobManager() {
	GlobalJobManager = &JobManager{
		jobs: make(map[string]*Job),
	}
}

func (jm *JobManager) CreateJob(id string, uid int64, jobType JobType) *Job {
	jm.mu.Lock()
	defer jm.mu.Unlock()
	job := &Job{
		ID:        id,
		UserId:    uid,
		Type:      jobType,
		Status:    JobStatusPending,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Errors:    []string{},
	}
	jm.jobs[id] = job
	return job
}

func (jm *JobManager) GetActiveJobs(uid int64) []*Job {
	jm.mu.RLock()
	defer jm.mu.RUnlock()
	active := []*Job{}
	for _, j := range jm.jobs {
		if j.UserId == uid && (j.Status == JobStatusPending || j.Status == JobStatusProcessing) {
			active = append(active, j)
		}
	}
	return active
}

func (jm *JobManager) GetJob(id string) (*Job, bool) {
	jm.mu.RLock()
	defer jm.mu.RUnlock()
	job, ok := jm.jobs[id]
	return job, ok
}

func (j *Job) UpdateProgress(processed int64, total int64) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Status == JobStatusCancelled {
		return
	}
	j.Processed = processed
	if total > 0 {
		j.Total = total
	}
	j.Status = JobStatusProcessing
	j.UpdatedAt = time.Now()
}

func (j *Job) Complete(result string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Status == JobStatusCancelled {
		return
	}
	j.Status = JobStatusCompleted
	j.Result = result
	j.UpdatedAt = time.Now()
}

func (j *Job) Fail(err string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = JobStatusFailed
	j.Errors = append(j.Errors, err)
	j.UpdatedAt = time.Now()
}

func (j *Job) AddError(err string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Errors = append(j.Errors, err)
}

func (j *Job) Cancel() {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Status == JobStatusPending || j.Status == JobStatusProcessing {
		j.Status = JobStatusCancelled
		j.UpdatedAt = time.Now()
	}
}

func (j *Job) IsCancelled() bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.Status == JobStatusCancelled
}
