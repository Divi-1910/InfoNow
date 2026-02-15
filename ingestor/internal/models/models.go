package models

import "time"

// BasePoint contains common fields for all source types
// Used for deduplication, routing, and topic classification
type BasePoint struct {
	ID             string    `json:"id"`              // SHA256 hash of source-specific unique key
	Topic          string    `json:"topic"`           // Topic slug
	SubTopic       string    `json:"subtopic"`        // SubTopic slug
	FetchTimestamp time.Time `json:"fetch_timestamp"` // When the data was fetched
	ContentHash    string    `json:"content_hash"`    // SHA256 hash of content for change detection
}

// NewsPoint represents a news article from NewsAPI
// Kafka topic: ingest.news.raw
type NewsPoint struct {
	BasePoint
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Description string    `json:"description,omitempty"`
	PublishedAt time.Time `json:"published_at"`
	SourceName  string    `json:"source_name,omitempty"`
	Author      string    `json:"author,omitempty"`
	ImageURL    string    `json:"image_url,omitempty"`
}

// RedditPoint represents a Reddit post
// Kafka topic: ingest.reddit.raw
type RedditPoint struct {
	BasePoint
	PostID      string    `json:"post_id"`
	Subreddit   string    `json:"subreddit"`
	Title       string    `json:"title"`
	Selftext    string    `json:"selftext,omitempty"`
	Author      string    `json:"author"`
	Score       int       `json:"score"`
	NumComments int       `json:"num_comments"`
	Permalink   string    `json:"permalink"`
	CreatedUTC  time.Time `json:"created_utc"`
	IsVideo     bool      `json:"is_video"`
	Thumbnail   string    `json:"thumbnail,omitempty"`
}

// YoutubePoint represents a YouTube video
// Kafka topic: ingest.yt.raw
type YoutubePoint struct {
	BasePoint
	VideoID      string    `json:"video_id"`
	ChannelID    string    `json:"channel_id"`
	ChannelTitle string    `json:"channel_title"`
	Title        string    `json:"title"`
	Description  string    `json:"description,omitempty"`
	ThumbnailURL string    `json:"thumbnail_url,omitempty"`
	PublishedAt  time.Time `json:"published_at"`
	Duration     string    `json:"duration,omitempty"` // ISO 8601 duration (e.g., "PT1H2M3S")
	ViewCount    int64     `json:"view_count"`
	LikeCount    int64     `json:"like_count"`
}

type Topic struct {
	ID        int
	Name      string
	Slug      string
	SubTopics []SubTopic
}

type SubTopic struct {
	ID   int
	Name string
	Slug string
}
