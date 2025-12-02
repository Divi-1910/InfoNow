package main

import (
	"context"
	"ingestor/internal/client"
	"ingestor/internal/config"
	"ingestor/internal/db"
	"log"
	"time"
)

func main() {
	log.Println("Starting the Ingestor ... ")

	config := config.LoadConfig()

	multiNewsClient := client.NewMultiNewsClient(config.NewsAPIKey1, config.NewsAPIKey2, config.NewsAPIKey3)

	pgDriver := db.NewDBDriver(config.PooledDBUrl, 25, 25, 5*time.Minute)
	defer pgDriver.Close()

	topics, err := pgDriver.GetAllTopicsAndSubTopics()
	if err != nil {
		log.Fatalf("Error getting Topics : %v", err)
	}

	ctx := context.Background()

	var Articles []client.Article

	for _, topic := range topics {
		subtopics := topic.SubTopics

		for _, subtopic := range subtopics {
			articles := multiNewsClient.GetArticles(ctx, subtopic.SubTopicSlug)
			Articles = append(Articles, articles...)
		}

	}

	// Articles := newsClient.GetAllArticles(ctx, "AI-Biology")

	log.Println(len(Articles))

	log.Println("Ingestor finished ... ")

}
