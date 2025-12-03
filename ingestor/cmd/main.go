package main

import (
	"ingestor/internal/config"
	"ingestor/internal/db"
	"log"
	"time"
)

func main() {
	log.Println("Starting the Ingestor ... ")

	config := config.LoadConfig()

	// multiNewsClient := client.NewMultiNewsClient(config.NewsAPIKey1, config.NewsAPIKey2, config.NewsAPIKey3)

	pgDriver := db.NewDBDriver(config.PooledDBUrl, 25, 25, 5*time.Minute)
	defer pgDriver.Close()

	tIds, err := pgDriver.GetAllTopicIDs()
	if err != nil {
		log.Fatalf("Error getting Topics : %v", err)
	}

	log.Println(tIds)

	for _, tId := range tIds {
		topic, err := pgDriver.GetTopicById(tId)
		if err != nil {
			log.Fatalf("Error getting Topics : %v", err)
		}
		log.Println(topic)

	}

	// topics, err := pgDriver.GetAllTopicsAndSubTopics()
	// if err != nil {
	// 	log.Fatalf("Error getting Topics : %v", err)
	// }

	// ctx := context.Background()

	// var Articles []client.Article

	// for _, topic := range topics {
	// 	subtopics := topic.SubTopics
	// 	articles := multiNewsClient.GetArticles(ctx, subtopics)
	// 	Articles = append(Articles, articles...)
	// }

	// // Articles := newsClient.GetAllArticles(ctx, "AI-Biology")
	// log.Println()
	// log.Println()
	// log.Println(Articles)
	// for _, article := range Articles {
	// 	log.Println(article.Title)
	// }

	log.Println("Ingestor finished ... ")

}
