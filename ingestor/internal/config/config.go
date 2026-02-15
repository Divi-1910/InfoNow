package config

import (
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	NewsAPIKey1       string
	NewsAPIKey2       string
	NewsAPIKey3       string
	YouTubeAPIKey     string
	ScheduledInterval time.Duration
	ServerPort        string
	BackendURL        string
	RedisAddr         string
	RedisPassword     string
	RedisDB           int
	KafkaBrokers      []string
	YouTubeMaxResults int
}

func LoadConfig() *Config {
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	viper.AutomaticEnv()
	viper.ReadInConfig()

	viper.SetDefault("INGESTOR_PORT", "7575")
	viper.SetDefault("SCHEDULED_INTERVAL_IN_HOURS", 4)
	viper.SetDefault("REDIS_ADDR", "localhost:6379")
	viper.SetDefault("REDIS_PASSWORD", "")
	viper.SetDefault("REDIS_DB", 0)
	viper.SetDefault("KAFKA_BROKERS", "localhost:9092")
	viper.SetDefault("YOUTUBE_MAX_RESULTS", 10)

	if !viper.IsSet("NEWSAPI_KEY_1") {
		log.Fatal("NEWSAPI KEY 1 MISSING")
	}

	if !viper.IsSet("NEWSAPI_KEY_2") {
		log.Fatal("NEWSAPI KEY 2 MISSING")
	}

	if !viper.IsSet("NEWSAPI_KEY_3") {
		log.Fatal("NEWSAPI KEY 3 MISSING")
	}

	if !viper.IsSet("BACKEND_URL") {
		log.Fatal("BACKEND URL MISSING")
	}
	if !viper.IsSet("YOUTUBE_API_KEY") {
		log.Fatal("YOUTUBE API KEY MISSING")
	}

	intervalHours := viper.GetInt("SCHEDULED_INTERVAL_IN_HOURS")
	if intervalHours <= 0 {
		intervalHours = 4
	}

	redisDB, err := strconv.Atoi(viper.GetString("REDIS_DB"))
	if err != nil {
		redisDB = 0
	}
	youtubeMaxResults := viper.GetInt("YOUTUBE_MAX_RESULTS")
	if youtubeMaxResults <= 0 || youtubeMaxResults > 50 {
		youtubeMaxResults = 10
	}

	config := &Config{
		NewsAPIKey1:       viper.GetString("NEWSAPI_KEY_1"),
		NewsAPIKey2:       viper.GetString("NEWSAPI_KEY_2"),
		NewsAPIKey3:       viper.GetString("NEWSAPI_KEY_3"),
		YouTubeAPIKey:     viper.GetString("YOUTUBE_API_KEY"),
		ScheduledInterval: time.Duration(intervalHours) * time.Hour,
		ServerPort:        viper.GetString("INGESTOR_PORT"),
		BackendURL:        viper.GetString("BACKEND_URL"),
		RedisAddr:         viper.GetString("REDIS_ADDR"),
		RedisPassword:     viper.GetString("REDIS_PASSWORD"),
		RedisDB:           redisDB,
		KafkaBrokers:      strings.Split(viper.GetString("KAFKA_BROKERS"), ","),
		YouTubeMaxResults: youtubeMaxResults,
	}

	return config

}
