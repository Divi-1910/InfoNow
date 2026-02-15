package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
	"transformer/internal/config"
	"transformer/internal/consumer"
	"transformer/internal/dlq"
	"transformer/internal/offsets"
	"transformer/internal/outbox"
	"transformer/internal/processor"
	"transformer/internal/storage"
)

type messageKey struct {
	partition int
	offset    int64
}

type processOutcome struct {
	index     int
	ack       bool
	retriable bool
	reason    string
}

func main() {
	log.Println("Starting Transformer Service")

	cfg := config.LoadConfig()

	store, err := storage.NewPostgresStorage(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer store.Close()
	log.Println("Connected to PostgreSQL")

	newsConsumer := consumer.NewKafkaConsumer(
		cfg.KafkaBrokers,
		cfg.KafkaInputTopic,
		cfg.KafkaConsumerGroup,
	)
	defer newsConsumer.Close()
	log.Printf("Kafka consumer initialized for topic: %s", cfg.KafkaInputTopic)

	ytConsumer := consumer.NewKafkaConsumer(
		cfg.KafkaBrokers,
		cfg.YouTubeInputTopic,
		cfg.YouTubeConsumerGroup,
	)
	defer ytConsumer.Close()
	log.Printf("Kafka consumer initialized for topic: %s", cfg.YouTubeInputTopic)

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

	megaPublisher := outbox.NewMegaPublisher(
		store.DB(),
		cfg.OpenSearchURL,
		cfg.OutboxPollInterval,
		cfg.OutboxBatchSize,
		cfg.OutboxMaxRetries,
	)
	log.Printf("Mega publisher initialized (opensearch=%s)", cfg.OpenSearchURL)

	newsProcessor := processor.NewNewsProcessor()
	ytProcessor := processor.NewYouTubeProcessor()
	dlqProducer := dlq.NewProducer(cfg.KafkaBrokers)
	defer dlqProducer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Shutdown signal received, stopping...")
		cancel()
	}()

	go outboxPublisher.Start(ctx)
	go megaPublisher.Start(ctx)

	log.Println("Starting message processing loops")
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		processNewsMessages(ctx, cfg, newsConsumer, store, newsProcessor, dlqProducer)
	}()

	go func() {
		defer wg.Done()
		processYouTubeMessages(ctx, cfg, ytConsumer, store, ytProcessor, dlqProducer)
	}()

	wg.Wait()
}

func processNewsMessages(
	ctx context.Context,
	cfg *config.Config,
	kafkaConsumer *consumer.KafkaConsumer,
	store *storage.PostgresStorage,
	proc *processor.NewsProcessor,
	dlqProducer *dlq.Producer,
) {
	tracker := offsets.NewTracker()
	retryCounts := make(map[messageKey]int)

	for {
		select {
		case <-ctx.Done():
			log.Println("Context cancelled, exiting news processing loop")
			return
		default:
		}

		fetchCtx, fetchCancel := context.WithTimeout(ctx, 5*time.Second)
		newsPoints, messages, err := kafkaConsumer.FetchBatch(fetchCtx, cfg.BatchSize)
		fetchCancel()

		if err != nil {
			if ctx.Err() != nil {
				return
			}
			if err == context.DeadlineExceeded || err == context.Canceled {
				continue
			}
			log.Printf("Error fetching news messages: %v", err)
			time.Sleep(time.Second)
			continue
		}
		if len(newsPoints) == 0 {
			continue
		}

		outcomes := make([]processOutcome, 0, len(newsPoints))
		results := make(chan processOutcome, len(newsPoints))
		var wg sync.WaitGroup
		sem := make(chan struct{}, cfg.ProcessingWorkers)

		for i := range newsPoints {
			i := i
			wg.Add(1)
			go func() {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				np := newsPoints[i]
				result := proc.Validate(np)
				if !result.Valid {
					results <- processOutcome{index: i, ack: false, retriable: false, reason: result.Reason}
					return
				}

				exists, err := store.CheckURLExists(ctx, result.Cleaned.URL)
				if err != nil {
					results <- processOutcome{index: i, ack: false, retriable: true, reason: "db duplicate check failed"}
					return
				}
				if exists {
					results <- processOutcome{index: i, ack: true, retriable: false}
					return
				}

				if _, err := store.SaveNewsArticleWithOutbox(ctx, result.Cleaned, cfg.KafkaOutputTopic); err != nil {
					results <- processOutcome{index: i, ack: false, retriable: true, reason: "db save failed"}
					return
				}
				results <- processOutcome{index: i, ack: true, retriable: false}
			}()
		}
		wg.Wait()
		close(results)

		for outcome := range results {
			outcomes = append(outcomes, outcome)
		}

		for _, outcome := range outcomes {
			msg := messages[outcome.index]
			key := messageKey{partition: msg.Partition, offset: msg.Offset}

			if outcome.ack {
				delete(retryCounts, key)
				tracker.Ack(msg)
				continue
			}

			if outcome.retriable {
				retryCounts[key]++
				if retryCounts[key] < cfg.ProcessingMaxRetries {
					continue
				}
			}

			reason := outcome.reason
			attempts := retryCounts[key]
			if outcome.retriable {
				reason = "max retries reached: " + outcome.reason
			} else if attempts == 0 {
				attempts = 1
			}

			err := dlqProducer.Publish(ctx, cfg.NewsDLQTopic, dlq.Event{
				SourceTopic: cfg.KafkaInputTopic,
				Partition:   msg.Partition,
				Offset:      msg.Offset,
				Key:         string(msg.Key),
				Reason:      reason,
				Attempts:    attempts,
				Payload:     msg.Value,
			})
			if err != nil {
				log.Printf("Failed to publish news DLQ event partition=%d offset=%d: %v", msg.Partition, msg.Offset, err)
				continue
			}

			delete(retryCounts, key)
			tracker.Ack(msg)
		}

		if err := tracker.CommitReady(ctx, kafkaConsumer.CommitMessages); err != nil {
			log.Printf("Error committing contiguous news offsets: %v", err)
		}
	}
}

func processYouTubeMessages(
	ctx context.Context,
	cfg *config.Config,
	kafkaConsumer *consumer.KafkaConsumer,
	store *storage.PostgresStorage,
	proc *processor.YouTubeProcessor,
	dlqProducer *dlq.Producer,
) {
	tracker := offsets.NewTracker()
	retryCounts := make(map[messageKey]int)

	for {
		select {
		case <-ctx.Done():
			log.Println("Context cancelled, exiting youtube processing loop")
			return
		default:
		}

		fetchCtx, fetchCancel := context.WithTimeout(ctx, 5*time.Second)
		ytPoints, messages, err := kafkaConsumer.FetchYouTubeBatch(fetchCtx, cfg.BatchSize)
		fetchCancel()

		if err != nil {
			if ctx.Err() != nil {
				return
			}
			if err == context.DeadlineExceeded || err == context.Canceled {
				continue
			}
			log.Printf("Error fetching youtube messages: %v", err)
			time.Sleep(time.Second)
			continue
		}
		if len(ytPoints) == 0 {
			continue
		}

		outcomes := make([]processOutcome, 0, len(ytPoints))
		results := make(chan processOutcome, len(ytPoints))
		var wg sync.WaitGroup
		sem := make(chan struct{}, cfg.ProcessingWorkers)

		for i := range ytPoints {
			i := i
			wg.Add(1)
			go func() {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				yp := ytPoints[i]
				result := proc.Validate(yp)
				if !result.Valid {
					results <- processOutcome{index: i, ack: false, retriable: false, reason: result.Reason}
					return
				}

				exists, err := store.CheckVideoIDExists(ctx, result.Cleaned.VideoID)
				if err != nil {
					results <- processOutcome{index: i, ack: false, retriable: true, reason: "db duplicate check failed"}
					return
				}
				if exists {
					results <- processOutcome{index: i, ack: true, retriable: false}
					return
				}

				if _, err := store.SaveYoutubeVideoWithOutbox(ctx, result.Cleaned, cfg.YouTubeOutputTopic); err != nil {
					results <- processOutcome{index: i, ack: false, retriable: true, reason: "db save failed"}
					return
				}
				results <- processOutcome{index: i, ack: true, retriable: false}
			}()
		}
		wg.Wait()
		close(results)

		for outcome := range results {
			outcomes = append(outcomes, outcome)
		}

		for _, outcome := range outcomes {
			msg := messages[outcome.index]
			key := messageKey{partition: msg.Partition, offset: msg.Offset}

			if outcome.ack {
				delete(retryCounts, key)
				tracker.Ack(msg)
				continue
			}

			if outcome.retriable {
				retryCounts[key]++
				if retryCounts[key] < cfg.ProcessingMaxRetries {
					continue
				}
			}

			reason := outcome.reason
			attempts := retryCounts[key]
			if outcome.retriable {
				reason = "max retries reached: " + outcome.reason
			} else if attempts == 0 {
				attempts = 1
			}

			err := dlqProducer.Publish(ctx, cfg.YouTubeDLQTopic, dlq.Event{
				SourceTopic: cfg.YouTubeInputTopic,
				Partition:   msg.Partition,
				Offset:      msg.Offset,
				Key:         string(msg.Key),
				Reason:      reason,
				Attempts:    attempts,
				Payload:     msg.Value,
			})
			if err != nil {
				log.Printf("Failed to publish youtube DLQ event partition=%d offset=%d: %v", msg.Partition, msg.Offset, err)
				continue
			}

			delete(retryCounts, key)
			tracker.Ack(msg)
		}

		if err := tracker.CommitReady(ctx, kafkaConsumer.CommitMessages); err != nil {
			log.Printf("Error committing contiguous youtube offsets: %v", err)
		}
	}
}
