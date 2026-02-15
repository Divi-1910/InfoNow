package processor

import (
	"strings"
	"transformer/internal/models"
	"unicode/utf8"
)

// YouTubeProcessor handles validation and cleaning of youtube videos
type YouTubeProcessor struct{}

func NewYouTubeProcessor() *YouTubeProcessor {
	return &YouTubeProcessor{}
}

type YouTubeValidationResult struct {
	Valid   bool
	Reason  string
	Cleaned models.YoutubePoint
}

// Validate checks if a youtube point is valid and cleans it
func (p *YouTubeProcessor) Validate(yp models.YoutubePoint) YouTubeValidationResult {
	if yp.ID == "" {
		return YouTubeValidationResult{Valid: false, Reason: "missing ID"}
	}
	if yp.VideoID == "" {
		return YouTubeValidationResult{Valid: false, Reason: "missing video_id"}
	}
	if yp.Title == "" {
		return YouTubeValidationResult{Valid: false, Reason: "missing title"}
	}

	cleaned := p.clean(yp)

	if len(cleaned.Title) < 3 {
		return YouTubeValidationResult{Valid: false, Reason: "title too short"}
	}
	if len(cleaned.Title) > 500 {
		return YouTubeValidationResult{Valid: false, Reason: "title too long"}
	}
	if !utf8.ValidString(cleaned.Title) {
		return YouTubeValidationResult{Valid: false, Reason: "invalid UTF-8 in title"}
	}

	return YouTubeValidationResult{Valid: true, Cleaned: cleaned}
}

func (p *YouTubeProcessor) clean(yp models.YoutubePoint) models.YoutubePoint {
	return models.YoutubePoint{
		ID:             yp.ID,
		Topic:          strings.TrimSpace(yp.Topic),
		SubTopic:       strings.TrimSpace(yp.SubTopic),
		FetchTimestamp: yp.FetchTimestamp,
		ContentHash:    yp.ContentHash,
		VideoID:        strings.TrimSpace(yp.VideoID),
		ChannelID:      strings.TrimSpace(yp.ChannelID),
		ChannelTitle:   cleanText(yp.ChannelTitle),
		Title:          cleanText(yp.Title),
		Description:    cleanText(yp.Description),
		ThumbnailURL:   strings.TrimSpace(yp.ThumbnailURL),
		PublishedAt:    yp.PublishedAt,
		Duration:       strings.TrimSpace(yp.Duration),
		ViewCount:      yp.ViewCount,
		LikeCount:      yp.LikeCount,
	}
}
