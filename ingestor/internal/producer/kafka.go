package producer

import (
	"context"
	"encoding/json"
	"ingestor/internal/models"

	"github.com/segmentio/kafka-go"
)

type KafkaProducer struct {
	writer *kafka.Writer
}

func NewKafkaProducer(brokers []string) *KafkaProducer {
	return &KafkaProducer{
		writer: &kafka.Writer{
			Addr:     kafka.TCP(brokers...),
			Topic:    "ingest.news.raw",
			Balancer: &kafka.Hash{},
		},
	}
}

func (p *KafkaProducer) Publish(ctx context.Context, dp models.DataPoint) error {
	value, err := json.Marshal(dp)
	if err != nil {
		return err
	}

	return p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(dp.DataID),
		Value: value,
	})
}

func (p *KafkaProducer) Close() error {
	return p.writer.Close()
}
