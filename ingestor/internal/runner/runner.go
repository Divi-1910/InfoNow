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

func ConvertArticleToDataPoint(article client.Article, topic string, subtopic string) (models.DataPoint, error) {
	dataID, err := identity.NewsDataID(article.URL)
	if err != nil {
		return models.DataPoint{}, fmt.Errorf("failed to generate data_id: %w", err)
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

	return models.DataPoint{
		DataID:         dataID,
		SourceType:     "news",
		Topic:          topic,
		SubTopic:       subtopic,
		Title:          article.Title,
		URL:            article.URL,
		Description:    article.Description,
		PublishedAt:    publishedAt,
		FetchTimestamp: time.Now().UTC(),
		ContentHash:    contentHash,
		RawMetadata: map[string]string{
			"source_name": article.Source.Name,
			"author":      article.Author,
		},
	}, nil
}
