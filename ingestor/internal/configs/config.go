package configs

import (
	"log"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	KafkaBroker string
	RedisAddr   string

	NewsAPIKey  string
	NewsBaseURL string

	ScheduleInterval time.Duration

	HTTPPort string
}

func LoadConfig() *Config {
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	viper.AutomaticEnv()

	_ = viper.ReadInConfig()

	viper.SetDefault("KAFKA_BROKER", "kafka:29092")
	viper.SetDefault("REDIS_ADDR", "localhost:6379")
	viper.SetDefault("NEWSAPI_BASE_URL", "https://newsapi.org/v2")
	viper.SetDefault("GLOBAL_TOPICS", "ai,tech,world,crypto")
	viper.SetDefault("SCHEDULE_INTERVAL_SECONDS", 900)
	viper.SetDefault("INGESTOR_HTTP_PORT", "8081")

	if !viper.IsSet("NEWSAPI_KEY") {
		log.Fatal("MISSING REQUIRED ENV VARIABLE: NEWSAPI_KEY")
	}

	config := Config{
		KafkaBroker: viper.GetString("KAFKA_BROKER"),
		RedisAddr:   viper.GetString("REDIS_ADDR"),

		NewsAPIKey:  viper.GetString("NEWSAPI_KEY"),
		NewsBaseURL: viper.GetString("NEWSAPI_BASE_URL"),

		ScheduleInterval: time.Duration(viper.GetInt("SCHEDULE_INTERVAL_SECONDS")) * time.Second,

		HTTPPort: viper.GetString("INGESTOR_HTTP_PORT"),
	}

	return &config

}
