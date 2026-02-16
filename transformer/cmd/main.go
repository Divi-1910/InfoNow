package main

import (
	"context"
	"log/slog"
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
	index       int
	ack         bool
	retriable   bool
	reason      string
	dataPointID string
}

func main() {
	cfg := config.LoadConfig()

	logger := setupLogger(cfg)
	slog.SetDefault(logger)

	logger.Info("starting transformer service",
		"event", "service_starting",
		"kafka_brokers", cfg.KafkaBrokers,
		"news_input_topic", cfg.KafkaInputTopic,
		"news_output_topic", cfg.KafkaOutputTopic,
		"yt_input_topic", cfg.YouTubeInputTopic,
		"yt_output_topic", cfg.YouTubeOutputTopic,
		"news_dlq_topic", cfg.NewsDLQTopic,
		"yt_dlq_topic", cfg.YouTubeDLQTopic,
		"batch_size", cfg.BatchSize,
		"processing_workers", cfg.ProcessingWorkers,
		"processing_max_retries", cfg.ProcessingMaxRetries,
		"outbox_poll_interval", cfg.OutboxPollInterval.String(),
		"outbox_batch_size", cfg.OutboxBatchSize,
		"outbox_max_retries", cfg.OutboxMaxRetries,
		"opensearch_url", cfg.OpenSearchURL,
	)

	store, err := storage.NewPostgresStorage(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to postgres", "event", "postgres_connect_failed", "error", err)
		os.Exit(1)
	}
	defer store.Close()
	logger.Info("connected to postgres", "event", "postgres_connected")

	newsConsumer := consumer.NewKafkaConsumer(
		cfg.KafkaBrokers,
		cfg.KafkaInputTopic,
		cfg.KafkaConsumerGroup,
	)
	defer newsConsumer.Close()
	logger.Info("initialized kafka consumer",
		"event", "kafka_consumer_initialized",
		"topic", cfg.KafkaInputTopic,
		"group_id", cfg.KafkaConsumerGroup,
	)

	ytConsumer := consumer.NewKafkaConsumer(
		cfg.KafkaBrokers,
		cfg.YouTubeInputTopic,
		cfg.YouTubeConsumerGroup,
	)
	defer ytConsumer.Close()
	logger.Info("initialized kafka consumer",
		"event", "kafka_consumer_initialized",
		"topic", cfg.YouTubeInputTopic,
		"group_id", cfg.YouTubeConsumerGroup,
	)

	outboxPublisher := outbox.NewPublisher(
		store.DB(),
		cfg.KafkaBrokers,
		cfg.OutboxPollInterval,
		cfg.OutboxBatchSize,
		cfg.OutboxMaxRetries,
	)
	defer outboxPublisher.Close()
	logger.Info("initialized kafka outbox publisher", "event", "outbox_publisher_initialized")

	megaPublisher := outbox.NewMegaPublisher(
		store.DB(),
		cfg.OpenSearchURL,
		cfg.OutboxPollInterval,
		cfg.OutboxBatchSize,
		cfg.OutboxMaxRetries,
	)
	logger.Info("initialized mega publisher",
		"event", "mega_publisher_initialized",
		"opensearch_url", cfg.OpenSearchURL,
	)

	newsProcessor := processor.NewNewsProcessor()
	ytProcessor := processor.NewYouTubeProcessor()
	dlqProducer := dlq.NewProducer(cfg.KafkaBrokers)
	defer dlqProducer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		logger.Warn("shutdown signal received", "event", "shutdown_signal", "signal", sig.String())
		cancel()
	}()

	go outboxPublisher.Start(ctx)
	go megaPublisher.Start(ctx)

	logger.Info("starting processing loops", "event", "processing_loops_starting")
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
	logger.Info("transformer stopped", "event", "service_stopped")
}

func setupLogger(cfg *config.Config) *slog.Logger {
	var level slog.Level
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn", "warning":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	handlerOpts := &slog.HandlerOptions{
		Level:     level,
		AddSource: false,
	}

	var handler slog.Handler
	if cfg.LogFormat == "text" {
		handler = slog.NewTextHandler(os.Stdout, handlerOpts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, handlerOpts)
	}

	return slog.New(handler).With("service", "transformer")
}

func processNewsMessages(
	ctx context.Context,
	cfg *config.Config,
	kafkaConsumer *consumer.KafkaConsumer,
	store *storage.PostgresStorage,
	proc *processor.NewsProcessor,
	dlqProducer *dlq.Producer,
) {
	logger := slog.With("component", "news_pipeline", "input_topic", cfg.KafkaInputTopic)
	tracker := offsets.NewTracker()
	retryCounts := make(map[messageKey]int)

	for {
		select {
		case <-ctx.Done():
			logger.Info("news pipeline stopping", "event", "pipeline_stopping")
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
			logger.Error("news kafka fetch failed", "event", "kafka_fetch_failed", "error", err)
			time.Sleep(time.Second)
			continue
		}
		if len(newsPoints) == 0 {
			continue
		}

		logger.Info("news batch fetched", "event", "kafka_batch_fetched", "message_count", len(newsPoints))

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
					results <- processOutcome{index: i, ack: true, retriable: false, reason: "duplicate"}
					return
				}

				dataPointID, err := store.SaveNewsArticleWithOutbox(ctx, result.Cleaned, cfg.KafkaOutputTopic)
				if err != nil {
					results <- processOutcome{index: i, ack: false, retriable: true, reason: "db save failed"}
					return
				}
				results <- processOutcome{index: i, ack: true, retriable: false, reason: "saved", dataPointID: dataPointID}
			}()
		}
		wg.Wait()
		close(results)

		for outcome := range results {
			outcomes = append(outcomes, outcome)
		}

		savedCount := 0
		duplicateCount := 0
		validationFailedCount := 0
		retryQueuedCount := 0
		dlqCount := 0

		for _, outcome := range outcomes {
			msg := messages[outcome.index]
			key := messageKey{partition: msg.Partition, offset: msg.Offset}

			if outcome.ack {
				delete(retryCounts, key)
				tracker.Ack(msg)
				if outcome.reason == "saved" {
					savedCount++
					logger.Info("news article persisted and queued to outbox",
						"event", "news_saved",
						"partition", msg.Partition,
						"offset", msg.Offset,
						"data_point_id", outcome.dataPointID,
					)
				} else {
					duplicateCount++
					logger.Debug("news article skipped as duplicate",
						"event", "news_duplicate",
						"partition", msg.Partition,
						"offset", msg.Offset,
					)
				}
				continue
			}

			if outcome.retriable {
				retryCounts[key]++
				if retryCounts[key] < cfg.ProcessingMaxRetries {
					retryQueuedCount++
					logger.Warn("news processing failed, will retry",
						"event", "news_retry_scheduled",
						"partition", msg.Partition,
						"offset", msg.Offset,
						"attempt", retryCounts[key],
						"max_retries", cfg.ProcessingMaxRetries,
						"reason", outcome.reason,
					)
					continue
				}
			} else {
				validationFailedCount++
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
				logger.Error("failed to publish news dlq event",
					"event", "dlq_publish_failed",
					"partition", msg.Partition,
					"offset", msg.Offset,
					"error", err,
				)
				continue
			}

			dlqCount++
			logger.Warn("news message sent to dlq",
				"event", "dlq_published",
				"partition", msg.Partition,
				"offset", msg.Offset,
				"attempts", attempts,
				"reason", reason,
			)

			delete(retryCounts, key)
			tracker.Ack(msg)
		}

		if err := tracker.CommitReady(ctx, kafkaConsumer.CommitMessages); err != nil {
			logger.Error("failed to commit contiguous news offsets", "event", "kafka_commit_frontier_failed", "error", err)
		}

		logger.Info("news batch processed",
			"event", "news_batch_processed",
			"message_count", len(outcomes),
			"saved_count", savedCount,
			"duplicate_count", duplicateCount,
			"validation_failed_count", validationFailedCount,
			"retry_queued_count", retryQueuedCount,
			"dlq_count", dlqCount,
		)
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
	logger := slog.With("component", "youtube_pipeline", "input_topic", cfg.YouTubeInputTopic)
	tracker := offsets.NewTracker()
	retryCounts := make(map[messageKey]int)

	for {
		select {
		case <-ctx.Done():
			logger.Info("youtube pipeline stopping", "event", "pipeline_stopping")
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
			logger.Error("youtube kafka fetch failed", "event", "kafka_fetch_failed", "error", err)
			time.Sleep(time.Second)
			continue
		}
		if len(ytPoints) == 0 {
			continue
		}

		logger.Info("youtube batch fetched", "event", "kafka_batch_fetched", "message_count", len(ytPoints))

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
					results <- processOutcome{index: i, ack: true, retriable: false, reason: "duplicate"}
					return
				}

				dataPointID, err := store.SaveYoutubeVideoWithOutbox(ctx, result.Cleaned, cfg.YouTubeOutputTopic)
				if err != nil {
					results <- processOutcome{index: i, ack: false, retriable: true, reason: "db save failed"}
					return
				}
				results <- processOutcome{index: i, ack: true, retriable: false, reason: "saved", dataPointID: dataPointID}
			}()
		}
		wg.Wait()
		close(results)

		for outcome := range results {
			outcomes = append(outcomes, outcome)
		}

		savedCount := 0
		duplicateCount := 0
		validationFailedCount := 0
		retryQueuedCount := 0
		dlqCount := 0

		for _, outcome := range outcomes {
			msg := messages[outcome.index]
			key := messageKey{partition: msg.Partition, offset: msg.Offset}

			if outcome.ack {
				delete(retryCounts, key)
				tracker.Ack(msg)
				if outcome.reason == "saved" {
					savedCount++
					logger.Info("youtube video persisted and queued to outbox",
						"event", "youtube_saved",
						"partition", msg.Partition,
						"offset", msg.Offset,
						"data_point_id", outcome.dataPointID,
					)
				} else {
					duplicateCount++
					logger.Debug("youtube video skipped as duplicate",
						"event", "youtube_duplicate",
						"partition", msg.Partition,
						"offset", msg.Offset,
					)
				}
				continue
			}

			if outcome.retriable {
				retryCounts[key]++
				if retryCounts[key] < cfg.ProcessingMaxRetries {
					retryQueuedCount++
					logger.Warn("youtube processing failed, will retry",
						"event", "youtube_retry_scheduled",
						"partition", msg.Partition,
						"offset", msg.Offset,
						"attempt", retryCounts[key],
						"max_retries", cfg.ProcessingMaxRetries,
						"reason", outcome.reason,
					)
					continue
				}
			} else {
				validationFailedCount++
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
				logger.Error("failed to publish youtube dlq event",
					"event", "dlq_publish_failed",
					"partition", msg.Partition,
					"offset", msg.Offset,
					"error", err,
				)
				continue
			}

			dlqCount++
			logger.Warn("youtube message sent to dlq",
				"event", "dlq_published",
				"partition", msg.Partition,
				"offset", msg.Offset,
				"attempts", attempts,
				"reason", reason,
			)

			delete(retryCounts, key)
			tracker.Ack(msg)
		}

		if err := tracker.CommitReady(ctx, kafkaConsumer.CommitMessages); err != nil {
			logger.Error("failed to commit contiguous youtube offsets", "event", "kafka_commit_frontier_failed", "error", err)
		}

		logger.Info("youtube batch processed",
			"event", "youtube_batch_processed",
			"message_count", len(outcomes),
			"saved_count", savedCount,
			"duplicate_count", duplicateCount,
			"validation_failed_count", validationFailedCount,
			"retry_queued_count", retryQueuedCount,
			"dlq_count", dlqCount,
		)
	}
}
