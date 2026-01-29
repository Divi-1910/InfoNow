package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
	"transformer/internal/config"
	"transformer/internal/consumer"
	"transformer/internal/outbox"
	"transformer/internal/processor"
	"transformer/internal/storage"
)

func main() {
	log.Println("Starting Transformer Service")

	cfg := config.LoadConfig()

	// Initialize storage
	store, err := storage.NewPostgresStorage(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer store.Close()
	log.Println("Connected to PostgreSQL")

	// Initialize Kafka consumer
	kafkaConsumer := consumer.NewKafkaConsumer(
		cfg.KafkaBrokers,
		cfg.KafkaInputTopic,
		cfg.KafkaConsumerGroup,
	)
	defer kafkaConsumer.Close()
	log.Printf("Kafka consumer initialized for topic: %s", cfg.KafkaInputTopic)

	// Initialize outbox publisher (replaces direct Kafka producer)
	outboxPublisher := outbox.NewPublisher(
		store.DB(),
		cfg.KafkaBrokers,
		cfg.OutboxPollInterval,
		cfg.OutboxBatchSize,
		cfg.OutboxMaxRetries,
	)
	defer outboxPublisher.Close()
	log.Printf("Outbox publisher initialized (interval=%v, batch=%d, maxRetries=%d)",
		cfg.OutboxPollInterval, cfg.OutboxBatchSize, cfg.OutboxMaxRetries)

	// Initialize processor
	newsProcessor := processor.NewNewsProcessor()

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Shutdown signal received, stopping...")
		cancel()
	}()

	// Start outbox publisher in background goroutine
	go outboxPublisher.Start(ctx)

	// Main processing loop (now writes to DB + outbox, no direct Kafka publish)
	log.Println("Starting message processing loop")
	processMessages(ctx, cfg, kafkaConsumer, store, newsProcessor)
}

func processMessages(
	ctx context.Context,
	cfg *config.Config,
	kafkaConsumer *consumer.KafkaConsumer,
	store *storage.PostgresStorage,
	proc *processor.NewsProcessor,
) {
	for {
		select {
		case <-ctx.Done():
			log.Println("Context cancelled, exiting processing loop")
			return
		default:
		}

		// Create a timeout context for fetching messages
		fetchCtx, fetchCancel := context.WithTimeout(ctx, 5*time.Second)

		// Fetch batch of messages
		newsPoints, messages, err := kafkaConsumer.FetchBatch(fetchCtx, cfg.BatchSize)
		fetchCancel()

		if err != nil {
			if ctx.Err() != nil {
				return // Context cancelled
			}
			log.Printf("Error fetching messages: %v", err)
			time.Sleep(time.Second)
			continue
		}

		if len(newsPoints) == 0 {
			continue
		}

		log.Printf("Processing batch of %d messages", len(newsPoints))

		var validCount, invalidCount, duplicateCount int

		for _, np := range newsPoints {
			// Validate and clean
			result := proc.Validate(np)
			if !result.Valid {
				invalidCount++
				log.Printf("Invalid article (ID=%s): %s", np.ID, result.Reason)
				continue
			}

			// Check for duplicates in DB
			exists, err := store.CheckURLExists(ctx, result.Cleaned.URL)
			if err != nil {
				log.Printf("Error checking URL existence: %v", err)
				continue
			}
			if exists {
				duplicateCount++
				continue
			}

			// Save to database + create outbox event (single atomic transaction)
			// The outbox publisher will handle Kafka publishing asynchronously
			_, err = store.SaveNewsArticleWithOutbox(ctx, result.Cleaned, cfg.KafkaOutputTopic)
			if err != nil {
				log.Printf("Error saving article (ID=%s): %v", np.ID, err)
				continue
			}

			validCount++
		}

		// Commit processed messages
		if err := kafkaConsumer.CommitMessages(ctx, messages); err != nil {
			log.Printf("Error committing messages: %v", err)
		}

		log.Printf("Batch complete: valid=%d invalid=%d duplicates=%d (outbox will publish)",
			validCount, invalidCount, duplicateCount)
	}
}
