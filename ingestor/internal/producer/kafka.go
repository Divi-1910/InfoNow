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

func (p *KafkaProducer) PublishNews(ctx context.Context, np models.NewsPoint) error {
	value, err := json.Marshal(np)
	if err != nil {
		return err
	}

	return p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(np.ID),
		Value: value,
	})
}

func (p *KafkaProducer) Close() error {
	return p.writer.Close()
}
