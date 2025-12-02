package main

import (
	"context"
	"ingestor/internal/client"
	"ingestor/internal/config"
	"log"
)

func main() {
	log.Println("Starting the Ingestor ... ")

	config := config.LoadConfig()

	newsClient := client.NewNewsAPIClient("https://newsapi.org/v2", config.NewsAPIKey)

	ctx := context.Background()

	Articles := newsClient.GetAllArticles(ctx, "AI-Biology")

	log.Println(len(Articles))

	log.Println("Ingestor finished ... ")

}
