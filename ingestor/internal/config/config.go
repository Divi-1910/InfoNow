package config

import (
	"log"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	NewsAPIKey1       string
	NewsAPIKey2       string
	NewsAPIKey3       string
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

	if !viper.IsSet("NEWSAPI_KEY_1") {
		log.Fatal("NEWSAPI KEY 1 MISSING")
	}

	if !viper.IsSet("NEWSAPI_KEY_2") {
		log.Fatal("NEWSAPI KEY 2 MISSING")
	}

	if !viper.IsSet("NEWSAPI_KEY_3") {
		log.Fatal("NEWSAPI KEY 1 MISSING")
	}

	if !viper.IsSet("DIRECT_DATABASE_URL") {
		log.Fatal("DIRECT DATABASE URL MISSING")
	}
	if !viper.IsSet("POOLED_DATABASE_URL") {
		log.Fatal("POOLED DATABASE URL MISSING")
	}

	config := &Config{
		NewsAPIKey1:       viper.GetString("NEWSAPI_KEY_1"),
		NewsAPIKey2:       viper.GetString("NEWSAPI_KEY_2"),
		NewsAPIKey3:       viper.GetString("NEWSAPI_KEY_3"),
		DirectDBUrl:       viper.GetString("DIRECT_DATABASE_URL"),
		PooledDBUrl:       viper.GetString("POOLED_DATABASE_URL"),
		ScheduledInterval: viper.GetDuration("SCHEDULED_INTERVAL_IN_HOURS") * time.Hour,
		ServerPort:        viper.GetString("INGESTOR_PORT"),
	}

	return config

}
