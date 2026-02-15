package ingest

import (
	"context"
	"ingestor/internal/client"
	"ingestor/internal/deduper"
	"ingestor/internal/identity"
	"ingestor/internal/producer"
	"ingestor/internal/runner"
	"log"
	"time"
)

type NewsIngestor struct {
	backendClient *client.BackendClient
	newsClient    *client.MultiNewsClient
	deduper       *deduper.Deduper
	producer      *producer.KafkaProducer
	maxPerTopic   int
	opTimeout     time.Duration
}

func NewNewsIngestor(
	backend *client.BackendClient,
	news *client.MultiNewsClient,
	dup *deduper.Deduper,
	prod *producer.KafkaProducer,
	maxPerTopic int,
	opTimeout time.Duration,
) *NewsIngestor {
	return &NewsIngestor{
		backendClient: backend,
		newsClient:    news,
		deduper:       dup,
		producer:      prod,
		maxPerTopic:   maxPerTopic,
		opTimeout:     opTimeout,
	}
}

func (n *NewsIngestor) Run(ctx context.Context) {
	log.Println("Starting news ingestion cycle")

	topics, err := n.backendClient.GetAllTopics(ctx)
	if err != nil {
		log.Printf("Failed to fetch topics: %v", err)
		return
	}

	log.Printf("Fetched %d topics", len(topics))

	totalFetched := 0
	totalDeduped := 0
	totalPublished := 0
	firstFew := 0

	for _, topic := range topics {
		if err := ctx.Err(); err != nil {
			log.Printf("Stopping news ingestion early: %v", err)
			return
		}

		if len(topic.SubTopics) == 0 {
			continue
		}

		subTopicArticles := n.newsClient.GetArticles(ctx, topic.SubTopics)
		totalFetched += len(subTopicArticles)

		log.Printf("Topic %s: fetched %d articles", topic.Slug, len(subTopicArticles))

		processedInTopic := 0
		for _, item := range subTopicArticles {
			if n.maxPerTopic > 0 && processedInTopic >= n.maxPerTopic {
				log.Printf("Topic %s: reached cap (%d), moving to next topic", topic.Slug, n.maxPerTopic)
				break
			}

			article := item.Article
			dataID, err := identity.NewsDataID(article.URL)
			if err != nil {
				log.Printf("Failed to generate data_id for %s: %v", article.URL, err)
				continue
			}

			opCtx, cancel := context.WithTimeout(ctx, n.opTimeout)
			dup, err := n.deduper.IsDuplicate(opCtx, dataID)
			cancel()
			if err != nil {
				log.Printf("Deduper failed for %s, skipping: %v", dataID, err)
				continue
			}

			if dup {
				totalDeduped++
				continue
			}

			if firstFew < 3 {
				log.Printf("Publishing unique article: %s", article.Title)
				firstFew++
			}

			np, err := runner.ConvertArticleToNewsPoint(article, topic.Slug, item.SubTopic.Slug)
			if err != nil {
				log.Printf("Failed to convert article: %v", err)
				continue
			}

			opCtx, cancel = context.WithTimeout(ctx, n.opTimeout)
			if err := n.producer.PublishNews(opCtx, np); err != nil {
				cancel()
				log.Printf("Failed to publish %s: %v", np.ID, err)
				continue
			}
			cancel()

			totalPublished++
			processedInTopic++
			if processedInTopic%50 == 0 {
				log.Printf("Topic %s progress: processed=%d published=%d", topic.Slug, processedInTopic, totalPublished)
			}
		}
	}

	log.Printf("News ingestion cycle complete: fetched=%d deduped=%d published=%d", totalFetched, totalDeduped, totalPublished)
}
