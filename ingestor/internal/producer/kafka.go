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
	"time"

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
	start := time.Now()
	value, err := json.Marshal(np)
	if err != nil {
		log.Printf(
			"event=kafka_produce_err service=ingestor source=news topic=%s key=%s topic_slug=%s subtopic_slug=%s latency_ms=%d error=%q",
			NewsRawTopic, np.ID, np.Topic, np.SubTopic, time.Since(start).Milliseconds(), err.Error(),
		)
		return err
	}

	err = p.newsWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(np.ID),
		Value: value,
	})
	if err != nil {
		log.Printf(
			"event=kafka_produce_err service=ingestor source=news topic=%s key=%s topic_slug=%s subtopic_slug=%s latency_ms=%d error=%q",
			NewsRawTopic, np.ID, np.Topic, np.SubTopic, time.Since(start).Milliseconds(), err.Error(),
		)
		return err
	}
	log.Printf(
		"event=kafka_produce_ok service=ingestor source=news topic=%s key=%s topic_slug=%s subtopic_slug=%s payload_bytes=%d latency_ms=%d",
		NewsRawTopic, np.ID, np.Topic, np.SubTopic, len(value), time.Since(start).Milliseconds(),
	)
	return nil
}

func (p *KafkaProducer) PublishYoutube(ctx context.Context, yp models.YoutubePoint) error {
	start := time.Now()
	value, err := json.Marshal(yp)
	if err != nil {
		log.Printf(
			"event=kafka_produce_err service=ingestor source=youtube topic=%s key=%s topic_slug=%s subtopic_slug=%s latency_ms=%d error=%q",
			YoutubeRawTopic, yp.ID, yp.Topic, yp.SubTopic, time.Since(start).Milliseconds(), err.Error(),
		)
		return err
	}

	err = p.ytWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(yp.ID),
		Value: value,
	})
	if err != nil {
		log.Printf(
			"event=kafka_produce_err service=ingestor source=youtube topic=%s key=%s topic_slug=%s subtopic_slug=%s latency_ms=%d error=%q",
			YoutubeRawTopic, yp.ID, yp.Topic, yp.SubTopic, time.Since(start).Milliseconds(), err.Error(),
		)
		return err
	}
	log.Printf(
		"event=kafka_produce_ok service=ingestor source=youtube topic=%s key=%s topic_slug=%s subtopic_slug=%s payload_bytes=%d latency_ms=%d",
		YoutubeRawTopic, yp.ID, yp.Topic, yp.SubTopic, len(value), time.Since(start).Milliseconds(),
	)
	return nil
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
		log.Printf("event=kafka_topic_ensure_err service=ingestor step=dial broker=%q error=%q", strings.TrimSpace(brokers[0]), err.Error())
		return
	}
	defer conn.Close()

	controller, err := conn.Controller()
	if err != nil {
		log.Printf("event=kafka_topic_ensure_err service=ingestor step=controller_lookup error=%q", err.Error())
		return
	}

	controllerConn, err := kafka.Dial("tcp", net.JoinHostPort(controller.Host, fmt.Sprintf("%d", controller.Port)))
	if err != nil {
		log.Printf("event=kafka_topic_ensure_err service=ingestor step=controller_dial host=%q port=%d error=%q", controller.Host, controller.Port, err.Error())
		return
	}
	defer controllerConn.Close()

	partitions, err := controllerConn.ReadPartitions()
	if err != nil {
		log.Printf("event=kafka_topic_ensure_err service=ingestor step=read_partitions error=%q", err.Error())
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
		log.Printf("event=kafka_topic_ensure_err service=ingestor step=create_topics error=%q", err.Error())
		return
	}

	createdTopics := make([]string, 0, len(missing))
	for _, cfg := range missing {
		createdTopics = append(createdTopics, cfg.Topic)
	}
	log.Printf("event=kafka_topic_ensure_ok service=ingestor created_topics=%q", strings.Join(createdTopics, ","))
}
