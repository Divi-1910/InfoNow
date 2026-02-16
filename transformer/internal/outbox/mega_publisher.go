package outbox

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const megaIndexName = "mega_index"

// MegaPublisher polls DataPointCreated OutboxEvents and writes initial
// documents to mega_index using op_type=create (so enricher upserts always win).
type MegaPublisher struct {
	db         *sql.DB
	osURL      string
	interval   time.Duration
	batch      int
	maxRetries int
	httpClient *http.Client
}

func NewMegaPublisher(db *sql.DB, osURL string, interval time.Duration, batch, maxRetries int) *MegaPublisher {
	return &MegaPublisher{
		db:         db,
		osURL:      strings.TrimRight(osURL, "/"),
		interval:   interval,
		batch:      batch,
		maxRetries: maxRetries,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Start runs the polling loop until context is cancelled.
func (p *MegaPublisher) Start(ctx context.Context) {
	slog.Info("mega publisher started",
		"component", "mega_publisher",
		"event", "mega_publisher_started",
		"poll_interval", p.interval.String(),
		"batch_size", p.batch,
		"max_retries", p.maxRetries,
		"opensearch_url", p.osURL,
	)

	if err := p.ensureIndex(ctx); err != nil {
		slog.Error("failed to ensure mega index",
			"component", "mega_publisher",
			"event", "os_index_ensure_failed",
			"error", err,
		)
	}

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("mega publisher stopping", "component", "mega_publisher", "event", "mega_publisher_stopping")
			return
		case <-ticker.C:
			if n, err := p.processBatch(ctx); err != nil {
				slog.Error("mega publisher batch processing failed",
					"component", "mega_publisher",
					"event", "mega_batch_failed",
					"error", err,
				)
			} else if n > 0 {
				slog.Info("mega index upserts completed",
					"component", "mega_publisher",
					"event", "mega_batch_processed",
					"indexed_count", n,
				)
			}
		}
	}
}

func (p *MegaPublisher) processBatch(ctx context.Context) (int, error) {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck — superseded by explicit Commit below

	rows, err := tx.QueryContext(ctx,
		`SELECT id, "aggregateId", payload
		 FROM "OutboxEvent"
		 WHERE processed = false
		   AND "retryCount" < $1
		   AND "eventType" = 'DataPointCreated'
		 ORDER BY "createdAt"
		 FOR UPDATE SKIP LOCKED
		 LIMIT $2`,
		p.maxRetries, p.batch,
	)
	if err != nil {
		return 0, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	type row struct {
		id          string
		dataPointID string
		payload     []byte
	}
	var events []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.dataPointID, &r.payload); err != nil {
			return 0, fmt.Errorf("scan row: %w", err)
		}
		events = append(events, r)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate rows: %w", err)
	}

	count := 0
	for _, e := range events {
		if err := p.indexToOpenSearch(ctx, e.dataPointID, e.payload); err != nil {
			slog.Warn("mega index write failed, incrementing retry",
				"component", "mega_publisher",
				"event", "os_index_failed",
				"outbox_event_id", e.id,
				"data_point_id", e.dataPointID,
				"error", err,
			)
			if _, updateErr := tx.ExecContext(ctx,
				`UPDATE "OutboxEvent" SET "retryCount" = "retryCount" + 1, "lastError" = $1 WHERE id = $2`,
				err.Error(), e.id,
			); updateErr != nil {
				return 0, fmt.Errorf("mark failed event %s: %w", e.id, updateErr)
			}
		} else {
			if _, updateErr := tx.ExecContext(ctx,
				`UPDATE "OutboxEvent" SET processed = true, "processedAt" = $1 WHERE id = $2`,
				time.Now(), e.id,
			); updateErr != nil {
				return 0, fmt.Errorf("mark processed event %s: %w", e.id, updateErr)
			}
			count++
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return count, nil
}

// indexToOpenSearch writes a document using op_type=create.
// A 409 Conflict means the enricher already wrote a richer doc — skip silently.
func (p *MegaPublisher) indexToOpenSearch(ctx context.Context, dataPointID string, payload []byte) error {
	url := fmt.Sprintf("%s/%s/_create/%s", p.osURL, megaIndexName, dataPointID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == http.StatusConflict {
		// 409: doc already exists (enricher wrote it first) — not an error
		slog.Debug("mega index create skipped because document already exists",
			"component", "mega_publisher",
			"event", "os_index_conflict_skipped",
			"data_point_id", dataPointID,
		)
		return nil
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("opensearch returned %d for data_point_id=%s", resp.StatusCode, dataPointID)
	}
	return nil
}

// ensureIndex creates mega_index if it doesn't already exist.
func (p *MegaPublisher) ensureIndex(ctx context.Context) error {
	checkURL := fmt.Sprintf("%s/%s", p.osURL, megaIndexName)
	req, _ := http.NewRequestWithContext(ctx, http.MethodHead, checkURL, nil)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return nil // already exists
	}

	mapping := map[string]any{
		"settings": map[string]any{
			"number_of_shards":   1,
			"number_of_replicas": 0,
		},
		"mappings": map[string]any{
			"properties": map[string]any{
				"data_point_id":   map[string]any{"type": "keyword"},
				"source_type":     map[string]any{"type": "keyword"},
				"fetch_timestamp": map[string]any{"type": "date"},
				"topic_id":        map[string]any{"type": "integer"},
				"topic_name":      map[string]any{"type": "keyword"},
				"topic_slug":      map[string]any{"type": "keyword"},
				"subtopic_id":     map[string]any{"type": "integer"},
				"subtopic_name":   map[string]any{"type": "keyword"},
				"subtopic_slug":   map[string]any{"type": "keyword"},
				"title":           map[string]any{"type": "text", "analyzer": "standard"},
				"description":     map[string]any{"type": "text", "analyzer": "standard"},
				"summary":         map[string]any{"type": "text", "analyzer": "standard"},
				"has_enriched":    map[string]any{"type": "boolean"},
				"published_at":    map[string]any{"type": "date"},
				"source_name": map[string]any{
					"type":     "text",
					"analyzer": "standard",
					"fields":   map[string]any{"keyword": map[string]any{"type": "keyword"}},
				},
				"author":        map[string]any{"type": "keyword"},
				"url":           map[string]any{"type": "keyword", "index": false},
				"image_url":     map[string]any{"type": "keyword", "index": false},
				"video_id":      map[string]any{"type": "keyword"},
				"channel_id":    map[string]any{"type": "keyword"},
				"channel_title": map[string]any{"type": "text"},
				"thumbnail_url": map[string]any{"type": "keyword", "index": false},
				"duration":      map[string]any{"type": "keyword", "index": false},
				"view_count":    map[string]any{"type": "long"},
				"like_count":    map[string]any{"type": "long"},
			},
		},
	}

	body, _ := json.Marshal(mapping)
	req2, _ := http.NewRequestWithContext(ctx, http.MethodPut, checkURL, bytes.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	resp2, err := p.httpClient.Do(req2)
	if err != nil {
		return err
	}
	defer resp2.Body.Close()
	io.Copy(io.Discard, resp2.Body)

	if resp2.StatusCode != http.StatusOK && resp2.StatusCode != http.StatusCreated {
		return fmt.Errorf("failed to create index, status=%d", resp2.StatusCode)
	}
	slog.Info("created mega index",
		"component", "mega_publisher",
		"event", "os_index_created",
		"index", megaIndexName,
	)
	return nil
}
