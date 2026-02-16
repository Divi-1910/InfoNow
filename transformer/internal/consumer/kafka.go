package consumer

import (
	"context"
	"encoding/json"
	"log/slog"
	"transformer/internal/models"

	"github.com/segmentio/kafka-go"
)

type KafkaConsumer struct {
	reader  *kafka.Reader
	topic   string
	groupID string
	logger  *slog.Logger
}

func NewKafkaConsumer(brokers []string, topic, groupID string) *KafkaConsumer {
	return &KafkaConsumer{
		reader: kafka.NewReader(kafka.ReaderConfig{
			Brokers:        brokers,
			Topic:          topic,
			GroupID:        groupID,
			MinBytes:       1,    // 1B
			MaxBytes:       10e6, // 10MB
			CommitInterval: 0,    // Manual commit
		}),
		topic:   topic,
		groupID: groupID,
		logger: slog.With(
			"component", "kafka_consumer",
			"topic", topic,
			"group_id", groupID,
		),
	}
}

// FetchOneNews fetches one news message from Kafka without committing it.
func (c *KafkaConsumer) FetchOneNews(ctx context.Context) (models.NewsPoint, kafka.Message, error) {
	msg, err := c.reader.FetchMessage(ctx)
	if err != nil {
		return models.NewsPoint{}, kafka.Message{}, err
	}

	var np models.NewsPoint
	if err := json.Unmarshal(msg.Value, &np); err != nil {
		c.logger.Warn("news message unmarshal failed",
			"event", "kafka_unmarshal_failed",
			"partition", msg.Partition,
			"offset", msg.Offset,
			"error", err,
		)
		return models.NewsPoint{}, msg, err
	}

	return np, msg, nil
}

// FetchOneYouTube fetches one youtube message from Kafka without committing it.
func (c *KafkaConsumer) FetchOneYouTube(ctx context.Context) (models.YoutubePoint, kafka.Message, error) {
	msg, err := c.reader.FetchMessage(ctx)
	if err != nil {
		return models.YoutubePoint{}, kafka.Message{}, err
	}

	var yp models.YoutubePoint
	if err := json.Unmarshal(msg.Value, &yp); err != nil {
		c.logger.Warn("youtube message unmarshal failed",
			"event", "kafka_unmarshal_failed",
			"partition", msg.Partition,
			"offset", msg.Offset,
			"error", err,
		)
		return models.YoutubePoint{}, msg, err
	}

	return yp, msg, nil
}

// FetchBatch fetches up to batchSize messages from Kafka
func (c *KafkaConsumer) FetchBatch(ctx context.Context, batchSize int) ([]models.NewsPoint, []kafka.Message, error) {
	var newsPoints []models.NewsPoint
	var messages []kafka.Message

	for i := 0; i < batchSize; i++ {
		// Use FetchMessage for manual commit control
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if err == context.DeadlineExceeded || err == context.Canceled {
				break
			}
			// If we have some messages, return them; otherwise return error
			if len(messages) > 0 {
				break
			}
			return nil, nil, err
		}

		var np models.NewsPoint
		if err := json.Unmarshal(msg.Value, &np); err != nil {
			c.logger.Warn("news message unmarshal failed",
				"event", "kafka_unmarshal_failed",
				"partition", msg.Partition,
				"offset", msg.Offset,
				"error", err,
			)
			// Commit bad message to skip it
			if commitErr := c.reader.CommitMessages(ctx, msg); commitErr != nil {
				c.logger.Error("failed to commit bad news message",
					"event", "kafka_commit_bad_message_failed",
					"partition", msg.Partition,
					"offset", msg.Offset,
					"error", commitErr,
				)
			} else {
				c.logger.Info("bad news message committed and skipped",
					"event", "kafka_message_skipped",
					"partition", msg.Partition,
					"offset", msg.Offset,
				)
			}
			continue
		}

		newsPoints = append(newsPoints, np)
		messages = append(messages, msg)
	}

	return newsPoints, messages, nil
}

// FetchYouTubeBatch fetches up to batchSize YouTube messages from Kafka
func (c *KafkaConsumer) FetchYouTubeBatch(ctx context.Context, batchSize int) ([]models.YoutubePoint, []kafka.Message, error) {
	var ytPoints []models.YoutubePoint
	var messages []kafka.Message

	for i := 0; i < batchSize; i++ {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if err == context.DeadlineExceeded || err == context.Canceled {
				break
			}
			if len(messages) > 0 {
				break
			}
			return nil, nil, err
		}

		var yp models.YoutubePoint
		if err := json.Unmarshal(msg.Value, &yp); err != nil {
			c.logger.Warn("youtube message unmarshal failed",
				"event", "kafka_unmarshal_failed",
				"partition", msg.Partition,
				"offset", msg.Offset,
				"error", err,
			)
			if commitErr := c.reader.CommitMessages(ctx, msg); commitErr != nil {
				c.logger.Error("failed to commit bad youtube message",
					"event", "kafka_commit_bad_message_failed",
					"partition", msg.Partition,
					"offset", msg.Offset,
					"error", commitErr,
				)
			} else {
				c.logger.Info("bad youtube message committed and skipped",
					"event", "kafka_message_skipped",
					"partition", msg.Partition,
					"offset", msg.Offset,
				)
			}
			continue
		}

		ytPoints = append(ytPoints, yp)
		messages = append(messages, msg)
	}

	return ytPoints, messages, nil
}

// CommitMessages commits the processed messages
func (c *KafkaConsumer) CommitMessages(ctx context.Context, messages []kafka.Message) error {
	if len(messages) == 0 {
		return nil
	}
	err := c.reader.CommitMessages(ctx, messages...)
	if err != nil {
		c.logger.Error("kafka commit failed",
			"event", "kafka_commit_failed",
			"message_count", len(messages),
			"error", err,
		)
		return err
	}
	c.logger.Debug("kafka commit succeeded",
		"event", "kafka_commit_succeeded",
		"message_count", len(messages),
	)
	return nil
}

func (c *KafkaConsumer) Close() error {
	return c.reader.Close()
}
