package consumer

import (
	"context"
	"encoding/json"
	"log"
	"transformer/internal/models"

	"github.com/segmentio/kafka-go"
)

type KafkaConsumer struct {
	reader *kafka.Reader
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
	}
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
			log.Printf("Failed to unmarshal message: %v", err)
			// Commit bad message to skip it
			if commitErr := c.reader.CommitMessages(ctx, msg); commitErr != nil {
				log.Printf("Failed to commit bad message: %v", commitErr)
			}
			continue
		}

		newsPoints = append(newsPoints, np)
		messages = append(messages, msg)
	}

	return newsPoints, messages, nil
}

// CommitMessages commits the processed messages
func (c *KafkaConsumer) CommitMessages(ctx context.Context, messages []kafka.Message) error {
	if len(messages) == 0 {
		return nil
	}
	return c.reader.CommitMessages(ctx, messages...)
}

func (c *KafkaConsumer) Close() error {
	return c.reader.Close()
}
