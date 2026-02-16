package ingest

import (
	"context"
	"fmt"
	"ingestor/internal/client"
	"ingestor/internal/deduper"
	"ingestor/internal/identity"
	"ingestor/internal/models"
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
	_ = n.RunWithTopics(ctx, topics)
}

// RunWithTopics executes a news ingestion cycle for the given topics.
func (n *NewsIngestor) RunWithTopics(ctx context.Context, topics []models.Topic) CycleStats {
	stats := CycleStats{Topics: len(topics)}
	log.Printf("Fetched %d topics", len(topics))

	firstFew := 0
	for _, topic := range topics {
		if err := ctx.Err(); err != nil {
			log.Printf("Stopping news ingestion early: %v", err)
			return stats
		}

		if len(topic.SubTopics) == 0 {
			continue
		}

		subTopicArticles := n.newsClient.GetArticles(ctx, topic.SubTopics)
		stats.Fetched += len(subTopicArticles)
		log.Printf(
			"event=news_topic_fetch_done service=ingestor topic_slug=%s subtopic_count=%d fetched=%d",
			topic.Slug, len(topic.SubTopics), len(subTopicArticles),
		)

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
				stats.Deduped++
				if stats.Deduped%100 == 0 {
					log.Printf(
						"event=news_dedupe_progress service=ingestor topic_slug=%s deduped_total=%d",
						topic.Slug, stats.Deduped,
					)
				}
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

			stats.Published++
			processedInTopic++
			if processedInTopic%50 == 0 {
				log.Printf(
					"event=news_topic_progress service=ingestor topic_slug=%s processed_in_topic=%d published_total=%d",
					topic.Slug, processedInTopic, stats.Published,
				)
			}
		}
	}

	log.Printf(
		"News ingestion cycle complete: fetched=%d deduped=%d published=%d",
		stats.Fetched,
		stats.Deduped,
		stats.Published,
	)
	return stats
}

// RunAll fetches backend topics and executes a single cycle.
func (n *NewsIngestor) RunAll(ctx context.Context) (CycleStats, error) {
	log.Println("Starting news ingestion cycle")
	topics, err := n.backendClient.GetAllTopics(ctx)
	if err != nil {
		return CycleStats{}, fmt.Errorf("fetch topics: %w", err)
	}
	return n.RunWithTopics(ctx, topics), nil
}
