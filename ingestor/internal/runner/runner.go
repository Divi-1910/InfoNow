package runner

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"ingestor/internal/client"
	"strings"
	"time"
)

type DataPoint struct {
	DataPointID string `json:"data_id"`
	SourceType  string `json:"source_type"`
	Topic       string `json:"topic"`
	SubTopic    string `json:"subtopic,omitempty"`

	Title       string `json:"title"`
	URL         string `json:"url"`
	Description string `json:"description"`

	PublishedAt    time.Time `json:"published_at"`
	FetchTimestamp time.Time `json:"fetch_timestamp"`

	ContentHash string            `json:"content_hash"`
	RawMetadata map[string]string `json:"raw_metadata"`
}

func GetHash(url string) string {
	hash := sha256.Sum256([]byte(strings.TrimSpace(strings.ToLower(url))))

	return hex.EncodeToString(hash[:])
}

func GetUniqueDataIDFromArticle(url string, sourceType string) string {
	urlHash := GetHash(url)
	dataId := fmt.Sprintf("%s_%s", sourceType, urlHash)
	return dataId
}

func ConvertArticleToDataPoint(article client.Article, topic string, subtopic string) (DataPoint, error) {
	publishedAt, err := time.Parse(time.RFC3339, article.PublishedAt)
	if err != nil {
		publishedAt = time.Now().UTC()
	}

	dataId := GetUniqueDataIDFromArticle(article.URL, "news")

	contentBasis := strings.TrimSpace(article.Description)
	if contentBasis == "" {
		contentBasis = article.Title
	}
	contentHash := GetHash(contentBasis)

	dp := DataPoint{
		DataPointID:    dataId,
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
	}

	return dp, nil
}
