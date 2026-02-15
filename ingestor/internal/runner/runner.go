package runner

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"ingestor/internal/client"
	"ingestor/internal/identity"
	"ingestor/internal/models"
	"strings"
	"time"
)

func ComputeContentHash(text string) string {
	hash := sha256.Sum256([]byte(strings.TrimSpace(text)))
	return hex.EncodeToString(hash[:])
}

func ConvertArticleToNewsPoint(article client.Article, topic string, subtopic string) (models.NewsPoint, error) {
	dataID, err := identity.NewsDataID(article.URL)
	if err != nil {
		return models.NewsPoint{}, fmt.Errorf("failed to generate data_id: %w", err)
	}

	publishedAt, err := time.Parse(time.RFC3339, article.PublishedAt)
	if err != nil {
		publishedAt = time.Now().UTC()
	}

	contentBasis := strings.TrimSpace(article.Description)
	if contentBasis == "" {
		contentBasis = article.Title
	}
	contentHash := ComputeContentHash(contentBasis)

	return models.NewsPoint{
		BasePoint: models.BasePoint{
			ID:             dataID,
			Topic:          topic,
			SubTopic:       subtopic,
			FetchTimestamp: time.Now().UTC(),
			ContentHash:    contentHash,
		},
		Title:       article.Title,
		URL:         article.URL,
		Description: article.Description,
		PublishedAt: publishedAt,
		SourceName:  article.Source.Name,
		Author:      article.Author,
		ImageURL:    article.URLToImage,
	}, nil
}

func ConvertVideoToYoutubePoint(video client.YouTubeVideo, topic string, subtopic string) (models.YoutubePoint, error) {
	dataID, err := identity.YoutubeDataID(video.VideoID)
	if err != nil {
		return models.YoutubePoint{}, fmt.Errorf("failed to generate data_id: %w", err)
	}

	publishedAt, err := time.Parse(time.RFC3339, video.PublishedAt)
	if err != nil {
		publishedAt = time.Now().UTC()
	}

	contentBasis := strings.TrimSpace(video.Description)
	if contentBasis == "" {
		contentBasis = video.Title
	}
	contentHash := ComputeContentHash(contentBasis)

	return models.YoutubePoint{
		BasePoint: models.BasePoint{
			ID:             dataID,
			Topic:          topic,
			SubTopic:       subtopic,
			FetchTimestamp: time.Now().UTC(),
			ContentHash:    contentHash,
		},
		VideoID:      video.VideoID,
		ChannelID:    video.ChannelID,
		ChannelTitle: video.ChannelTitle,
		Title:        video.Title,
		Description:  video.Description,
		ThumbnailURL: video.ThumbnailURL,
		PublishedAt:  publishedAt,
		Duration:     video.Duration,
		ViewCount:    video.ViewCount,
		LikeCount:    video.LikeCount,
	}, nil
}
