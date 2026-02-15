package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"ingestor/internal/service"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	statusQueued    = "queued"
	statusRunning   = "running"
	statusCompleted = "completed"
	statusFailed    = "failed"
)

type job struct {
	ID             string             `json:"id"`
	Status         string             `json:"status"`
	Request        service.RunRequest `json:"request"`
	Result         *service.RunResult `json:"result,omitempty"`
	Error          string             `json:"error,omitempty"`
	IdempotencyKey string             `json:"idempotencyKey,omitempty"`
	CreatedAt      time.Time          `json:"createdAt"`
	StartedAt      *time.Time         `json:"startedAt,omitempty"`
	CompletedAt    *time.Time         `json:"completedAt,omitempty"`
}

type jobStore struct {
	mu         sync.RWMutex
	jobs       map[string]*job
	idempotent map[string]string
}

func newJobStore() *jobStore {
	return &jobStore{
		jobs:       make(map[string]*job),
		idempotent: make(map[string]string),
	}
}

func (s *jobStore) create(request service.RunRequest, idem string) (*job, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if idem != "" {
		if id, ok := s.idempotent[idem]; ok {
			existing := *s.jobs[id]
			return &existing, true
		}
	}

	now := time.Now().UTC()
	created := &job{
		ID:             newJobID(),
		Status:         statusQueued,
		Request:        request,
		IdempotencyKey: idem,
		CreatedAt:      now,
	}
	s.jobs[created.ID] = created
	if idem != "" {
		s.idempotent[idem] = created.ID
	}
	copy := *created
	return &copy, false
}

func (s *jobStore) get(id string) (*job, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	j, ok := s.jobs[id]
	if !ok {
		return nil, false
	}
	copy := *j
	return &copy, true
}

func (s *jobStore) start(id string) (service.RunRequest, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	j, ok := s.jobs[id]
	if !ok {
		return service.RunRequest{}, false
	}
	now := time.Now().UTC()
	j.Status = statusRunning
	j.StartedAt = &now
	return j.Request, true
}

func (s *jobStore) complete(id string, result service.RunResult) {
	s.mu.Lock()
	defer s.mu.Unlock()

	j, ok := s.jobs[id]
	if !ok {
		return
	}
	now := time.Now().UTC()
	j.Status = statusCompleted
	j.Result = &result
	j.CompletedAt = &now
}

func (s *jobStore) fail(id, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	j, ok := s.jobs[id]
	if !ok {
		return
	}
	now := time.Now().UTC()
	j.Status = statusFailed
	j.Error = errMsg
	j.CompletedAt = &now
}

type fixedWindowLimiter struct {
	mu          sync.Mutex
	limit       int
	windowStart time.Time
	count       int
}

func newFixedWindowLimiter(limit int) *fixedWindowLimiter {
	return &fixedWindowLimiter{
		limit:       limit,
		windowStart: time.Now().UTC(),
	}
}

func (l *fixedWindowLimiter) allow() bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now().UTC()
	if now.Sub(l.windowStart) >= time.Minute {
		l.windowStart = now
		l.count = 0
	}
	if l.count >= l.limit {
		return false
	}
	l.count++
	return true
}

type Server struct {
	addr       string
	apiKey     string
	jobTimeout time.Duration
	svc        *service.Service
	jobs       *jobStore
	limiter    *fixedWindowLimiter
	httpSrv    *http.Server
}

func NewServer(addr, apiKey string, rateLimit int, jobTimeout time.Duration, svc *service.Service) *Server {
	server := &Server{
		addr:       addr,
		apiKey:     apiKey,
		jobTimeout: jobTimeout,
		svc:        svc,
		jobs:       newJobStore(),
		limiter:    newFixedWindowLimiter(rateLimit),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.handleHealth)
	mux.HandleFunc("/ingestions", server.handleIngestions)
	mux.HandleFunc("/ingestions/", server.handleIngestionByID)

	server.httpSrv = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	return server
}

func (s *Server) Start(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		log.Printf("Ingestor API server listening on %s", s.addr)
		if err := s.httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return s.httpSrv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleIngestions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	if !s.limiter.allow() {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"message": "rate limit exceeded"})
		return
	}

	var req service.RunRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid JSON body"})
		return
	}

	if !req.All && strings.TrimSpace(req.Topic) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "topic is required when all=false"})
		return
	}
	if req.All && strings.TrimSpace(req.Topic) != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "topic must be empty when all=true"})
		return
	}

	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	created, existed := s.jobs.create(req, idempotencyKey)
	if !existed {
		go s.executeJob(created.ID)
	}

	status := http.StatusAccepted
	if existed {
		status = http.StatusOK
	}
	writeJSON(w, status, created)
}

func (s *Server) handleIngestionByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorize(w, r) {
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/ingestions/")
	if id == "" {
		http.NotFound(w, r)
		return
	}

	job, ok := s.jobs.get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "job not found"})
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) authorize(w http.ResponseWriter, r *http.Request) bool {
	token := strings.TrimSpace(r.Header.Get("X-API-Key"))
	if token == "" || token != s.apiKey {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "unauthorized"})
		return false
	}
	return true
}

func (s *Server) executeJob(jobID string) {
	req, ok := s.jobs.start(jobID)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), s.jobTimeout)
	defer cancel()

	result, err := s.svc.Run(ctx, req)
	if err != nil {
		s.jobs.fail(jobID, err.Error())
		return
	}
	s.jobs.complete(jobID, result)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func newJobID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("job-%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("job-%d-%s", time.Now().UnixNano(), hex.EncodeToString(b))
}
