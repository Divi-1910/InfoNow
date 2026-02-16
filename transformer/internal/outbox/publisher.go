package outbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"time"
	"transformer/internal/models"

	"github.com/segmentio/kafka-go"
)

// Publisher reads events from the outbox table and publishes them to Kafka
// It implements the "polling publisher" pattern for the transactional outbox
type Publisher struct {
	db         *sql.DB
	writer     *kafka.Writer
	interval   time.Duration
	batch      int
	maxRetries int
	logger     *slog.Logger
}

// NewPublisher creates a new outbox publisher
func NewPublisher(db *sql.DB, brokers []string, interval time.Duration, batchSize int, maxRetries int) *Publisher {
	return &Publisher{
		db: db,
		writer: &kafka.Writer{
			Addr:     kafka.TCP(brokers...),
			Balancer: &kafka.Hash{},
		},
		interval:   interval,
		batch:      batchSize,
		maxRetries: maxRetries,
		logger: slog.With(
			"component", "outbox_kafka_publisher",
			"poll_interval", interval.String(),
			"batch_size", batchSize,
			"max_retries", maxRetries,
		),
	}
}

// Start begins the background polling loop
// Call this in a goroutine: go publisher.Start(ctx)
func (p *Publisher) Start(ctx context.Context) {
	p.logger.Info("outbox kafka publisher started", "event", "outbox_publisher_started")

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("outbox kafka publisher stopping", "event", "outbox_publisher_stopping")
			return
		case <-ticker.C:
			count, err := p.processBatch(ctx)
			if err != nil {
				p.logger.Error("outbox batch processing failed", "event", "outbox_batch_failed", "error", err)
			} else if count > 0 {
				p.logger.Info("outbox batch processed", "event", "outbox_batch_processed", "event_count", count)
			}
		}
	}
}

// processBatch fetches unprocessed events and publishes them to Kafka
func (p *Publisher) processBatch(ctx context.Context) (int, error) {
	rows, err := p.db.QueryContext(ctx, `
		SELECT id, "aggregateId", topic, payload
		FROM "OutboxEvent"
		WHERE processed = false
		  AND "retryCount" < $1
		  AND "eventType" IN ('NewsArticleCreated', 'YoutubeVideoCreated', 'RedditPostCreated')
		ORDER BY "createdAt"
		FOR UPDATE SKIP LOCKED
		LIMIT $2
	`, p.maxRetries, p.batch)

	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var events []models.OutboxEvent

	for rows.Next() {
		var event models.OutboxEvent
		if err := rows.Scan(&event.ID, &event.AggregateID, &event.Topic, &event.Payload); err != nil {
			return 0, err
		}
		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return 0, err
	}

	if len(events) == 0 {
		return 0, nil
	}

	for _, event := range events {
		if err := p.publishToKafka(ctx, event); err != nil {
			p.logger.Error("failed to publish outbox event to kafka",
				"event", "outbox_publish_failed",
				"outbox_event_id", event.ID,
				"aggregate_id", event.AggregateID,
				"kafka_topic", event.Topic,
				"error", err,
			)
			if markErr := p.markFailed(ctx, event.ID, err.Error()); markErr != nil {
				p.logger.Error("failed to mark outbox event as failed",
					"event", "outbox_mark_failed_failed",
					"outbox_event_id", event.ID,
					"aggregate_id", event.AggregateID,
					"error", markErr,
				)
			}
			continue
		}

		if err := p.markProcessed(ctx, event.ID); err != nil {
			p.logger.Error("failed to mark outbox event as processed",
				"event", "outbox_mark_processed_failed",
				"outbox_event_id", event.ID,
				"aggregate_id", event.AggregateID,
				"error", err,
			)
			continue
		}

		p.logger.Debug("outbox event published to kafka",
			"event", "outbox_publish_succeeded",
			"outbox_event_id", event.ID,
			"aggregate_id", event.AggregateID,
			"kafka_topic", event.Topic,
		)
	}

	return len(events), nil
}

// markProcessed marks an event as successfully processed
func (p *Publisher) markProcessed(ctx context.Context, eventID string) error {
	_, err := p.db.ExecContext(ctx,
		`UPDATE "OutboxEvent"
		 SET processed = true, "processedAt" = NOW()
		 WHERE id = $1`,
		eventID,
	)
	return err
}

// markFailed increments the retry count and records the error
func (p *Publisher) markFailed(ctx context.Context, eventID string, lastError string) error {
	_, err := p.db.ExecContext(ctx,
		`UPDATE "OutboxEvent"
		 SET "retryCount" = "retryCount" + 1, "lastError" = $2
		 WHERE id = $1`,
		eventID, lastError,
	)
	return err
}

// publishToKafka publishes a single event to Kafka
func (p *Publisher) publishToKafka(ctx context.Context, event models.OutboxEvent) error {
	// Parse the payload to get the ID for the message key
	var payload map[string]any
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return err
	}

	// Use the aggregate ID as the message key for partitioning
	msg := kafka.Message{
		Topic: event.Topic,
		Key:   []byte(event.AggregateID),
		Value: event.Payload,
	}

	return p.writer.WriteMessages(ctx, msg)
}

// Close closes the Kafka writer
func (p *Publisher) Close() error {
	return p.writer.Close()
}
