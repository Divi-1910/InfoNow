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
	DataPointID string `json:"data_point_id"`
}

// YoutubePoint is the input model from ingest.yt.raw topic
// Matches the structure from the ingestor service
type YoutubePoint struct {
	ID             string    `json:"id"`
	Topic          string    `json:"topic"`
	SubTopic       string    `json:"subtopic"`
	FetchTimestamp time.Time `json:"fetch_timestamp"`
	ContentHash    string    `json:"content_hash"`
	VideoID        string    `json:"video_id"`
	ChannelID      string    `json:"channel_id"`
	ChannelTitle   string    `json:"channel_title"`
	Title          string    `json:"title"`
	Description    string    `json:"description,omitempty"`
	ThumbnailURL   string    `json:"thumbnail_url,omitempty"`
	PublishedAt    time.Time `json:"published_at"`
	Duration       string    `json:"duration,omitempty"`
	ViewCount      int64     `json:"view_count"`
	LikeCount      int64     `json:"like_count"`
}

// CleanYoutubePoint is the output model for process.yt.clean topic
// Contains validated and cleaned data ready for downstream enrichers
type CleanYoutubePoint struct {
	ID             string    `json:"id"`
	Topic          string    `json:"topic"`
	SubTopic       string    `json:"subtopic"`
	FetchTimestamp time.Time `json:"fetch_timestamp"`
	ContentHash    string    `json:"content_hash"`
	VideoID        string    `json:"video_id"`
	ChannelID      string    `json:"channel_id"`
	ChannelTitle   string    `json:"channel_title"`
	Title          string    `json:"title"`
	Description    string    `json:"description,omitempty"`
	ThumbnailURL   string    `json:"thumbnail_url,omitempty"`
	PublishedAt    time.Time `json:"published_at"`
	Duration       string    `json:"duration,omitempty"`
	ViewCount      int64     `json:"view_count"`
	LikeCount      int64     `json:"like_count"`
	// Database reference for downstream enrichers
	DataPointID string `json:"data_point_id"`
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
	OutboxEventNewsArticleCreated  OutboxEventType = "NewsArticleCreated"
	OutboxEventRedditPostCreated   OutboxEventType = "RedditPostCreated"
	OutboxEventYoutubeVideoCreated OutboxEventType = "YoutubeVideoCreated"
	OutboxEventDataPointCreated    OutboxEventType = "DataPointCreated"
)

// MegaDocument is the flat document written to mega_index in OpenSearch.
// One document per DataPoint — no embeddings — powers the feed and search APIs.
type MegaDocument struct {
	DataPointID    string  `json:"data_point_id"`
	SourceType     string  `json:"source_type"` // "news" or "youtube"
	FetchTimestamp string  `json:"fetch_timestamp"`
	TopicID        *int    `json:"topic_id,omitempty"`
	TopicName      string  `json:"topic_name"`
	TopicSlug      string  `json:"topic_slug"`
	SubTopicID     *int    `json:"subtopic_id,omitempty"`
	SubTopicName   string  `json:"subtopic_name"`
	SubTopicSlug   string  `json:"subtopic_slug"`
	Title          string  `json:"title"`
	Description    *string `json:"description,omitempty"`
	HasEnriched    bool    `json:"has_enriched"`
	PublishedAt    string  `json:"published_at"`
	// News-only fields
	URL        *string `json:"url,omitempty"`
	SourceName *string `json:"source_name,omitempty"`
	Author     *string `json:"author,omitempty"`
	ImageURL   *string `json:"image_url,omitempty"`
	// YouTube-only fields
	VideoID      *string `json:"video_id,omitempty"`
	ChannelID    *string `json:"channel_id,omitempty"`
	ChannelTitle *string `json:"channel_title,omitempty"`
	ThumbnailURL *string `json:"thumbnail_url,omitempty"`
	Duration     *string `json:"duration,omitempty"`
	ViewCount    *int64  `json:"view_count,omitempty"`
	LikeCount    *int64  `json:"like_count,omitempty"`
}

// OutboxEvent represents an event in the transactional outbox
// Used to ensure reliable message delivery to Kafka
type OutboxEvent struct {
	ID            string          `json:"id"`
	AggregateType string          `json:"aggregate_type"` // "news", "reddit", "youtube"
	AggregateID   string          `json:"aggregate_id"`   // The dataPointId
	EventType     OutboxEventType `json:"event_type"`
	Topic         string          `json:"topic"`   // Kafka topic to publish to
	Payload       []byte          `json:"payload"` // The CleanNewsPoint JSON
	Processed     bool            `json:"processed"`
	RetryCount    int             `json:"retry_count"`
	MaxRetries    int             `json:"max_retries"`
	LastError     *string         `json:"last_error,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	ProcessedAt   *time.Time      `json:"processed_at,omitempty"`
}
