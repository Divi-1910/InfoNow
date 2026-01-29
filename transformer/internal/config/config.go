package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	KafkaBrokers       []string
	KafkaConsumerGroup string
	KafkaInputTopic    string
	KafkaOutputTopic   string
	DatabaseURL        string
	BatchSize          int

	// Outbox publisher settings
	OutboxPollInterval time.Duration
	OutboxBatchSize    int
	OutboxMaxRetries   int
}

func LoadConfig() *Config {
	brokersStr := getEnv("KAFKA_BROKERS", "localhost:9092")
	brokers := strings.Split(brokersStr, ",")

	batchSize, err := strconv.Atoi(getEnv("BATCH_SIZE", "100"))
	if err != nil {
		batchSize = 100
	}

	// Parse outbox poll interval (default 1 second)
	outboxPollInterval, err := time.ParseDuration(getEnv("OUTBOX_POLL_INTERVAL", "1s"))
	if err != nil {
		outboxPollInterval = 1 * time.Second
	}

	outboxBatchSize, err := strconv.Atoi(getEnv("OUTBOX_BATCH_SIZE", "100"))
	if err != nil {
		outboxBatchSize = 100
	}

	outboxMaxRetries, err := strconv.Atoi(getEnv("OUTBOX_MAX_RETRIES", "3"))
	if err != nil {
		outboxMaxRetries = 3
	}

	cfg := &Config{
		KafkaBrokers:       brokers,
		KafkaConsumerGroup: getEnv("KAFKA_CONSUMER_GROUP", "transformer-news"),
		KafkaInputTopic:    getEnv("KAFKA_INPUT_TOPIC", "ingest.news.raw"),
		KafkaOutputTopic:   getEnv("KAFKA_OUTPUT_TOPIC", "process.news.clean"),
		DatabaseURL:        getEnv("DATABASE_URL", ""),
		BatchSize:          batchSize,

		OutboxPollInterval: outboxPollInterval,
		OutboxBatchSize:    outboxBatchSize,
		OutboxMaxRetries:   outboxMaxRetries,
	}

	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
