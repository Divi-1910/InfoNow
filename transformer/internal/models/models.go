package models

import "time"

// NewsPoint is the input model from ingest.news.raw topic
// Matches the structure from the ingestor service
type NewsPoint struct {
	ID             string    `json:"id"`
	Topic          string    `json:"topic"`
	SubTopic       string    `json:"subtopic"`
	FetchTimestamp time.Time `json:"fetch_timestamp"`
	ContentHash    string    `json:"content_hash"`
	Title          string    `json:"title"`
	URL            string    `json:"url"`
	Description    string    `json:"description,omitempty"`
	PublishedAt    time.Time `json:"published_at"`
	SourceName     string    `json:"source_name,omitempty"`
	Author         string    `json:"author,omitempty"`
	ImageURL       string    `json:"image_url,omitempty"`
}

// CleanNewsPoint is the output model for process.news.clean topic
// Contains validated and cleaned data ready for enrichment
type CleanNewsPoint struct {
	ID             string    `json:"id"`
	Topic          string    `json:"topic"`
	SubTopic       string    `json:"subtopic"`
	FetchTimestamp time.Time `json:"fetch_timestamp"`
	ContentHash    string    `json:"content_hash"`
	Title          string    `json:"title"`
	URL            string    `json:"url"`
	Description    string    `json:"description,omitempty"`
	PublishedAt    time.Time `json:"published_at"`
	SourceName     string    `json:"source_name,omitempty"`
	Author         string    `json:"author,omitempty"`
	ImageURL       string    `json:"image_url,omitempty"`
	// Database reference for the enricher
	DataPointID    string    `json:"data_point_id"`
}

// RawNewsArticle represents the database model for raw news storage
type RawNewsArticle struct {
	ID          string
	DataID      string
	Title       string
	URL         string
	Description *string
	PublishedAt time.Time
	SourceName  *string
	Author      *string
	ImageURL    *string
}

// DataPoint represents the base entity in the database
type DataPoint struct {
	ID          string
	Type        string
	ContentHash string
	TopicID     *int
	SubTopicID  *int
	FetchedAt   time.Time
}

// OutboxEventType represents the type of event in the outbox
type OutboxEventType string

const (
	OutboxEventNewsArticleCreated   OutboxEventType = "NewsArticleCreated"
	OutboxEventRedditPostCreated    OutboxEventType = "RedditPostCreated"
	OutboxEventYoutubeVideoCreated  OutboxEventType = "YoutubeVideoCreated"
)

// OutboxEvent represents an event in the transactional outbox
// Used to ensure reliable message delivery to Kafka
type OutboxEvent struct {
	ID            string          `json:"id"`
	AggregateType string          `json:"aggregate_type"` // "news", "reddit", "youtube"
	AggregateID   string          `json:"aggregate_id"`   // The dataPointId
	EventType     OutboxEventType `json:"event_type"`
	Topic         string          `json:"topic"`          // Kafka topic to publish to
	Payload       []byte          `json:"payload"`        // The CleanNewsPoint JSON
	Processed     bool            `json:"processed"`
	RetryCount    int             `json:"retry_count"`
	MaxRetries    int             `json:"max_retries"`
	LastError     *string         `json:"last_error,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	ProcessedAt   *time.Time      `json:"processed_at,omitempty"`
}
