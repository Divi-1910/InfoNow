package producer

import (
	"context"
	"encoding/json"
	"fmt"
	"ingestor/internal/models"
	"log"
	"net"
	"sort"
	"strings"

	"github.com/segmentio/kafka-go"
)

const (
	NewsRawTopic    = "ingest.news.raw"
	YoutubeRawTopic = "ingest.yt.raw"
)

type KafkaProducer struct {
	newsWriter *kafka.Writer
	ytWriter   *kafka.Writer
}

func NewKafkaProducer(brokers []string) *KafkaProducer {
	ensureTopics(brokers, []string{NewsRawTopic, YoutubeRawTopic})

	return &KafkaProducer{
		newsWriter: &kafka.Writer{
			Addr:     kafka.TCP(brokers...),
			Topic:    NewsRawTopic,
			Balancer: &kafka.Hash{},
		},
		ytWriter: &kafka.Writer{
			Addr:     kafka.TCP(brokers...),
			Topic:    YoutubeRawTopic,
			Balancer: &kafka.Hash{},
		},
	}
}

func (p *KafkaProducer) PublishNews(ctx context.Context, np models.NewsPoint) error {
	value, err := json.Marshal(np)
	if err != nil {
		return err
	}

	return p.newsWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(np.ID),
		Value: value,
	})
}

func (p *KafkaProducer) PublishYoutube(ctx context.Context, yp models.YoutubePoint) error {
	value, err := json.Marshal(yp)
	if err != nil {
		return err
	}

	return p.ytWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(yp.ID),
		Value: value,
	})
}

func (p *KafkaProducer) Close() error {
	var errs []string
	if err := p.newsWriter.Close(); err != nil {
		errs = append(errs, err.Error())
	}
	if err := p.ytWriter.Close(); err != nil {
		errs = append(errs, err.Error())
	}
	if len(errs) > 0 {
		return fmt.Errorf("failed to close kafka writers: %s", strings.Join(errs, "; "))
	}
	return nil
}

func ensureTopics(brokers []string, topics []string) {
	if len(brokers) == 0 || len(topics) == 0 {
		return
	}

	conn, err := kafka.Dial("tcp", strings.TrimSpace(brokers[0]))
	if err != nil {
		log.Printf("Kafka dial failed for topic initialization: %v", err)
		return
	}
	defer conn.Close()

	controller, err := conn.Controller()
	if err != nil {
		log.Printf("Kafka controller lookup failed: %v", err)
		return
	}

	controllerConn, err := kafka.Dial("tcp", net.JoinHostPort(controller.Host, fmt.Sprintf("%d", controller.Port)))
	if err != nil {
		log.Printf("Kafka controller dial failed: %v", err)
		return
	}
	defer controllerConn.Close()

	partitions, err := controllerConn.ReadPartitions()
	if err != nil {
		log.Printf("Kafka partition read failed: %v", err)
		return
	}

	existing := make(map[string]struct{})
	for _, p := range partitions {
		existing[p.Topic] = struct{}{}
	}

	missing := make([]kafka.TopicConfig, 0, len(topics))
	for _, topic := range topics {
		if _, ok := existing[topic]; ok {
			continue
		}
		missing = append(missing, kafka.TopicConfig{
			Topic:             topic,
			NumPartitions:     1,
			ReplicationFactor: 1,
		})
	}

	if len(missing) == 0 {
		return
	}

	sort.Slice(missing, func(i, j int) bool {
		return missing[i].Topic < missing[j].Topic
	})

	if err := controllerConn.CreateTopics(missing...); err != nil {
		log.Printf("Kafka topic creation failed: %v", err)
		return
	}

	createdTopics := make([]string, 0, len(missing))
	for _, cfg := range missing {
		createdTopics = append(createdTopics, cfg.Topic)
	}
	log.Printf("Kafka topics ensured: %s", strings.Join(createdTopics, ", "))
}
