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

	redisClient := redis.NewRedisClient(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	defer redisClient.Close()

	dup := deduper.New(redisClient, 14*24*time.Hour)

	backendClient := client.NewBackendClient(cfg.BackendURL)
	newsClient := client.NewMultiNewsClient(cfg.NewsAPIKey1, cfg.NewsAPIKey2, cfg.NewsAPIKey3)
	ytClient := client.NewYouTubeClient(cfg.YouTubeAPIKey, cfg.YouTubeMaxResults)

	kafkaProducer := producer.NewKafkaProducer(cfg.KafkaBrokers)
	defer kafkaProducer.Close()

	newsIngestor := ingest.NewNewsIngestor(backendClient, newsClient, dup, kafkaProducer)
	ytIngestor := ingest.NewYTIngestor(backendClient, ytClient, dup, kafkaProducer)

	ctx := context.Background()

	ticker := time.NewTicker(cfg.ScheduledInterval)
	defer ticker.Stop()

	newsIngestor.Run(ctx)
	ytIngestor.Run(ctx)

	for range ticker.C {
		newsIngestor.Run(ctx)
		ytIngestor.Run(ctx)
	}
}
