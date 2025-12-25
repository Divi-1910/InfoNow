package models

import "time"

type DataPoint struct {
	DataID         string            `json:"data_id"`
	SourceType     string            `json:"source_type"`
	Topic          string            `json:"topic"`
	SubTopic       string            `json:"subtopic,omitempty"`
	Title          string            `json:"title"`
	URL            string            `json:"url"`
	Description    string            `json:"description"`
	PublishedAt    time.Time         `json:"published_at"`
	FetchTimestamp time.Time         `json:"fetch_timestamp"`
	ContentHash    string            `json:"content_hash"`
	RawMetadata    map[string]string `json:"raw_metadata"`
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
