package dlq

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/segmentio/kafka-go"
)

type Event struct {
	SourceTopic string `json:"source_topic"`
	Partition   int    `json:"partition"`
	Offset      int64  `json:"offset"`
	Key         string `json:"key,omitempty"`
	Reason      string `json:"reason"`
	Attempts    int    `json:"attempts"`
	Payload     []byte `json:"payload"`
	FailedAt    string `json:"failed_at"`
}

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(brokers []string) *Producer {
	return &Producer{
		writer: &kafka.Writer{
			Addr:     kafka.TCP(brokers...),
			Balancer: &kafka.Hash{},
		},
	}
}

func (p *Producer) Publish(ctx context.Context, topic string, event Event) error {
	event.FailedAt = time.Now().UTC().Format(time.RFC3339)
	value, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal dlq event: %w", err)
	}

	return p.writer.WriteMessages(ctx, kafka.Message{
		Topic: topic,
		Key:   []byte(fmt.Sprintf("%s:%d:%d", event.SourceTopic, event.Partition, event.Offset)),
		Value: value,
	})
}

func (p *Producer) Close() error {
	return p.writer.Close()
}
