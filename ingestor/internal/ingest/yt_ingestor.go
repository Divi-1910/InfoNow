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

type YTIngestor struct {
	backendClient *client.BackendClient
	youtubeClient *client.YouTubeClient
	deduper       *deduper.Deduper
	producer      *producer.KafkaProducer
	opTimeout     time.Duration
}

func NewYTIngestor(
	backend *client.BackendClient,
	yt *client.YouTubeClient,
	dup *deduper.Deduper,
	prod *producer.KafkaProducer,
	opTimeout time.Duration,
) *YTIngestor {
	return &YTIngestor{
		backendClient: backend,
		youtubeClient: yt,
		deduper:       dup,
		producer:      prod,
		opTimeout:     opTimeout,
	}
}

func (y *YTIngestor) Run(ctx context.Context) {
	log.Println("Starting YouTube ingestion cycle")

	topics, err := y.backendClient.GetAllTopics(ctx)
	if err != nil {
		log.Printf("Failed to fetch topics: %v", err)
		return
	}
	_ = y.RunWithTopics(ctx, topics)
}

// RunWithTopics executes a YouTube ingestion cycle for the given topics.
func (y *YTIngestor) RunWithTopics(ctx context.Context, topics []models.Topic) CycleStats {
	stats := CycleStats{Topics: len(topics)}
	log.Printf("Fetched %d topics for YouTube ingestion", len(topics))

	for _, topic := range topics {
		if err := ctx.Err(); err != nil {
			log.Printf("Stopping YouTube ingestion early: %v", err)
			return stats
		}

		if len(topic.SubTopics) == 0 {
			continue
		}

		subTopicVideos := y.youtubeClient.GetVideos(ctx, topic.SubTopics)
		stats.Fetched += len(subTopicVideos)
		log.Printf(
			"event=youtube_topic_fetch_done service=ingestor topic_slug=%s subtopic_count=%d fetched=%d",
			topic.Slug, len(topic.SubTopics), len(subTopicVideos),
		)

		for _, item := range subTopicVideos {
			dataID, err := identity.YoutubeDataID(item.Video.VideoID)
			if err != nil {
				log.Printf("Failed to generate youtube data_id for %s: %v", item.Video.VideoID, err)
				continue
			}

			opCtx, cancel := context.WithTimeout(ctx, y.opTimeout)
			dup, err := y.deduper.IsDuplicate(opCtx, dataID)
			cancel()
			if err != nil {
				log.Printf("Deduper failed for %s, skipping: %v", dataID, err)
				continue
			}

			if dup {
				stats.Deduped++
				if stats.Deduped%100 == 0 {
					log.Printf(
						"event=youtube_dedupe_progress service=ingestor topic_slug=%s deduped_total=%d",
						topic.Slug, stats.Deduped,
					)
				}
				continue
			}

			yp, err := runner.ConvertVideoToYoutubePoint(item.Video, topic.Slug, item.SubTopic.Slug)
			if err != nil {
				log.Printf("Failed to convert youtube video: %v", err)
				continue
			}

			opCtx, cancel = context.WithTimeout(ctx, y.opTimeout)
			if err := y.producer.PublishYoutube(opCtx, yp); err != nil {
				cancel()
				log.Printf("Failed to publish youtube %s: %v", yp.ID, err)
				continue
			}
			cancel()

			stats.Published++
			if stats.Published%50 == 0 {
				log.Printf(
					"event=youtube_publish_progress service=ingestor topic_slug=%s published_total=%d",
					topic.Slug, stats.Published,
				)
			}
		}
	}

	log.Printf(
		"YouTube ingestion cycle complete: fetched=%d deduped=%d published=%d",
		stats.Fetched,
		stats.Deduped,
		stats.Published,
	)
	return stats
}

// RunAll fetches backend topics and executes a single cycle.
func (y *YTIngestor) RunAll(ctx context.Context) (CycleStats, error) {
	log.Println("Starting YouTube ingestion cycle")
	topics, err := y.backendClient.GetAllTopics(ctx)
	if err != nil {
		return CycleStats{}, fmt.Errorf("fetch topics: %w", err)
	}
	return y.RunWithTopics(ctx, topics), nil
}
