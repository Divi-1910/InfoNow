package configs

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	KafkaBroker string
	RedisAddr   string

	NewsAPIKey  string
	NewsBaseURL string

	ScheduleInterval time.Duration

	HTTPPort string
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getRequiredEnv(key string) string {
	value, exists := os.LookupEnv(key)
	if !exists || strings.TrimSpace(value) == "" {
		log.Fatalf("Config error : required key %s is missing in env", key)
	}
	return value
}

func New() *Config {
	intervalSeconds, err := strconv.Atoi(getEnv("SCHEDULE_INTERVAL_SECONDS", "900"))
	if err != nil {
		log.Fatalf("Config error : invalid SCHEDULE_INTERVAL_SECONDS value : %v", err)
	}

	cfg := &Config{
		KafkaBroker: getEnv("KAFKA_BROKER", "kafka:29092"),
		RedisAddr:   getEnv("REDIS_ADDR", "redis:6379"),

		NewsAPIKey:  getRequiredEnv("NEWS_API_KEY"),
		NewsBaseURL: getEnv("NEWSAPI_BASE_URL", "https://newsapi.org/v2"),

		ScheduleInterval: time.Duration(intervalSeconds) * time.Second,

		HTTPPort: getEnv("HTTP_PORT", "8080"),
	}

	return cfg

}
