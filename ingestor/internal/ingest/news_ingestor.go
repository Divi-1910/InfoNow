package ingest

import (
	"context"
	"ingestor/internal/client"
	"ingestor/internal/deduper"
	"ingestor/internal/identity"
	"ingestor/internal/producer"
	"ingestor/internal/runner"
	"log"
)

type NewsIngestor struct {
	backendClient *client.BackendClient
	newsClient    *client.MultiNewsClient
	deduper       *deduper.Deduper
	producer      *producer.KafkaProducer
}

func NewNewsIngestor(
	backend *client.BackendClient,
	news *client.MultiNewsClient,
	dup *deduper.Deduper,
	prod *producer.KafkaProducer,
) *NewsIngestor {
	return &NewsIngestor{
		backendClient: backend,
		newsClient:    news,
		deduper:       dup,
		producer:      prod,
	}
}

func (n *NewsIngestor) Run(ctx context.Context) {
	log.Println("Starting ingestion cycle")

	topics, err := n.backendClient.GetAllTopics(ctx)
	if err != nil {
		log.Printf("Failed to fetch topics: %v", err)
		return
	}

	log.Printf("Fetched %d topics", len(topics))

	totalFetched := 0
	totalDeduped := 0
	totalPublished := 0

	for _, topic := range topics {
		if len(topic.SubTopics) == 0 {
			continue
		}

		articles := n.newsClient.GetArticles(ctx, topic.SubTopics)
		totalFetched += len(articles)

		log.Printf("Topic %s: fetched %d articles", topic.Slug, len(articles))

		for _, article := range articles {
			dataID, err := identity.NewsDataID(article.URL)
			if err != nil {
				log.Printf("Failed to generate data_id for %s: %v", article.URL, err)
				continue
			}

			dup, err := n.deduper.IsDuplicate(ctx, dataID)
			if err != nil {
				log.Printf("Deduper failed for %s, skipping: %v", dataID, err)
				continue
			}

			if dup {
				totalDeduped++
				continue
			}

			dp, err := runner.ConvertArticleToDataPoint(article, topic.Slug, "")
			if err != nil {
				log.Printf("Failed to convert article: %v", err)
				continue
			}

			if err := n.producer.Publish(ctx, dp); err != nil {
				log.Printf("Failed to publish %s: %v", dp.DataID, err)
				continue
			}

			totalPublished++
		}
	}

	log.Printf("Ingestion cycle complete: fetched=%d deduped=%d published=%d", totalFetched, totalDeduped, totalPublished)
}
