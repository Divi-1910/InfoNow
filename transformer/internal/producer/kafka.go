package producer

import (
	"context"
	"encoding/json"
	"transformer/internal/models"

	"github.com/segmentio/kafka-go"
)

type KafkaProducer struct {
	writer *kafka.Writer
}

func NewKafkaProducer(brokers []string, topic string) *KafkaProducer {
	return &KafkaProducer{
		writer: &kafka.Writer{
			Addr:     kafka.TCP(brokers...),
			Topic:    topic,
			Balancer: &kafka.Hash{},
		},
	}
}

// PublishBatch publishes multiple clean news points to Kafka
func (p *KafkaProducer) PublishBatch(ctx context.Context, points []models.CleanNewsPoint) error {
	if len(points) == 0 {
		return nil
	}

	messages := make([]kafka.Message, 0, len(points))
	for _, point := range points {
		value, err := json.Marshal(point)
		if err != nil {
			continue
		}
		messages = append(messages, kafka.Message{
			Key:   []byte(point.ID),
			Value: value,
		})
	}

	return p.writer.WriteMessages(ctx, messages...)
}

// Publish publishes a single clean news point to Kafka
func (p *KafkaProducer) Publish(ctx context.Context, point models.CleanNewsPoint) error {
	value, err := json.Marshal(point)
	if err != nil {
		return err
	}

	return p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(point.ID),
		Value: value,
	})
}

func (p *KafkaProducer) Close() error {
	return p.writer.Close()
}
