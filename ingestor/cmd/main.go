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

	backendClient := client.NewBackendClient(config.BackendURL)

	ctx := context.Background()

	topics, err := backendClient.GetAllTopics(ctx)
	// if err != nil {
	// 	log.Fatalf("Error getting topics: %v", err)
	// }

	// log.Println(topics)

}
