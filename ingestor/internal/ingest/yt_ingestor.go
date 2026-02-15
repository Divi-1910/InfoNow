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

type YTIngestor struct {
	backendClient *client.BackendClient
	youtubeClient *client.YouTubeClient
	deduper       *deduper.Deduper
	producer      *producer.KafkaProducer
}

func NewYTIngestor(
	backend *client.BackendClient,
	yt *client.YouTubeClient,
	dup *deduper.Deduper,
	prod *producer.KafkaProducer,
) *YTIngestor {
	return &YTIngestor{
		backendClient: backend,
		youtubeClient: yt,
		deduper:       dup,
		producer:      prod,
	}
}

func (y *YTIngestor) Run(ctx context.Context) {
	log.Println("Starting YouTube ingestion cycle")

	topics, err := y.backendClient.GetAllTopics(ctx)
	if err != nil {
		log.Printf("Failed to fetch topics: %v", err)
		return
	}

	log.Printf("Fetched %d topics for YouTube ingestion", len(topics))

	totalFetched := 0
	totalDeduped := 0
	totalPublished := 0

	for _, topic := range topics {
		if len(topic.SubTopics) == 0 {
			continue
		}

		subTopicVideos := y.youtubeClient.GetVideos(ctx, topic.SubTopics)
		totalFetched += len(subTopicVideos)
		log.Printf("Topic %s: fetched %d youtube videos", topic.Slug, len(subTopicVideos))

		for _, item := range subTopicVideos {
			dataID, err := identity.YoutubeDataID(item.Video.VideoID)
			if err != nil {
				log.Printf("Failed to generate youtube data_id for %s: %v", item.Video.VideoID, err)
				continue
			}

			dup, err := y.deduper.IsDuplicate(ctx, dataID)
			if err != nil {
				log.Printf("Deduper failed for %s, skipping: %v", dataID, err)
				continue
			}

			if dup {
				totalDeduped++
				continue
			}

			yp, err := runner.ConvertVideoToYoutubePoint(item.Video, topic.Slug, item.SubTopic.Slug)
			if err != nil {
				log.Printf("Failed to convert youtube video: %v", err)
				continue
			}

			if err := y.producer.PublishYoutube(ctx, yp); err != nil {
				log.Printf("Failed to publish youtube %s: %v", yp.ID, err)
				continue
			}

			totalPublished++
		}
	}

	log.Printf("YouTube ingestion cycle complete: fetched=%d deduped=%d published=%d", totalFetched, totalDeduped, totalPublished)
}
