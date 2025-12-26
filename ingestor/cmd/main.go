package main

import (
	"context"
	"ingestor/internal/client"
	"ingestor/internal/config"
	"ingestor/internal/deduper"
	"ingestor/internal/ingest"
	"ingestor/internal/producer"
	"ingestor/internal/redis"
	"log"
	"time"
)

func main() {
	log.Println("Starting Ingestor")

	cfg := config.LoadConfig()

	redisClient := redis.NewRedisClient("localhost:6379", "", 0)
	defer redisClient.Close()

	dup := deduper.New(redisClient, 14*24*time.Hour)

	backendClient := client.NewBackendClient(cfg.BackendURL)
	newsClient := client.NewMultiNewsClient(cfg.NewsAPIKey1, cfg.NewsAPIKey2, cfg.NewsAPIKey3)

	kafkaProducer := producer.NewKafkaProducer([]string{"localhost:9093"})
	defer kafkaProducer.Close()

	ingestor := ingest.NewNewsIngestor(backendClient, newsClient, dup, kafkaProducer)

	ctx := context.Background()

	ticker := time.NewTicker(cfg.ScheduledInterval)
	defer ticker.Stop()

	ingestor.Run(ctx)

	for range ticker.C {
		ingestor.Run(ctx)
	}
}
