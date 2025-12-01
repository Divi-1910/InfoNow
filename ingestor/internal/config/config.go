package config

import (
	"log"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	NewsAPIKey        string
	DirectDBUrl       string
	PooledDBUrl       string
	ScheduledInterval time.Duration
	ServerPort        string
}

func LoadConfig() *Config {
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	viper.AutomaticEnv()
	viper.ReadInConfig()

	viper.SetDefault("INGESTOR_PORT", "7575")
	viper.SetDefault("SCHEDULED_INTERVAL_IN_HOURS", 4)

	if !viper.IsSet("NEWSAPI_KEY") {
		log.Fatal("NEWSAPI KEY MISSING")
	}
	if !viper.IsSet("DIRECT_DATABASE_URL") {
		log.Fatal("DIRECT DATABASE URL MISSING")
	}
	if !viper.IsSet("POOLED_DATABASE_URL") {
		log.Fatal("POOLED DATABASE URL MISSING")
	}

	config := &Config{
		NewsAPIKey:        viper.GetString("NEWSAPI_KEY"),
		DirectDBUrl:       viper.GetString("DIRECT_DB_URL"),
		PooledDBUrl:       viper.GetString("POOLED_DB_URL"),
		ScheduledInterval: viper.GetDuration("SCHEDULED_INTERVAL_IN_HOURS") * time.Hour,
		ServerPort:        viper.GetString("INGESTOR_PORT"),
	}

	return config

}
