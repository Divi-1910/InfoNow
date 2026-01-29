package processor

import (
	"strings"
	"transformer/internal/models"
	"unicode/utf8"
)

// NewsProcessor handles validation and cleaning of news articles
type NewsProcessor struct{}

func NewNewsProcessor() *NewsProcessor {
	return &NewsProcessor{}
}

// ValidationResult contains the result of validating a news point
type ValidationResult struct {
	Valid   bool
	Reason  string
	Cleaned models.NewsPoint
}

// Validate checks if a news point is valid and cleans it
func (p *NewsProcessor) Validate(np models.NewsPoint) ValidationResult {
	// Required fields check
	if np.ID == "" {
		return ValidationResult{Valid: false, Reason: "missing ID"}
	}
	if np.URL == "" {
		return ValidationResult{Valid: false, Reason: "missing URL"}
	}
	if np.Title == "" {
		return ValidationResult{Valid: false, Reason: "missing title"}
	}

	// Clean the data
	cleaned := p.clean(np)

	// Validate cleaned data
	if len(cleaned.Title) < 10 {
		return ValidationResult{Valid: false, Reason: "title too short"}
	}
	if len(cleaned.Title) > 500 {
		return ValidationResult{Valid: false, Reason: "title too long"}
	}

	// Check for valid UTF-8
	if !utf8.ValidString(cleaned.Title) {
		return ValidationResult{Valid: false, Reason: "invalid UTF-8 in title"}
	}

	return ValidationResult{Valid: true, Cleaned: cleaned}
}

// clean sanitizes and normalizes the news point data
func (p *NewsProcessor) clean(np models.NewsPoint) models.NewsPoint {
	return models.NewsPoint{
		ID:             np.ID,
		Topic:          strings.TrimSpace(np.Topic),
		SubTopic:       strings.TrimSpace(np.SubTopic),
		FetchTimestamp: np.FetchTimestamp,
		ContentHash:    np.ContentHash,
		Title:          cleanText(np.Title),
		URL:            strings.TrimSpace(np.URL),
		Description:    cleanText(np.Description),
		PublishedAt:    np.PublishedAt,
		SourceName:     strings.TrimSpace(np.SourceName),
		Author:         strings.TrimSpace(np.Author),
		ImageURL:       strings.TrimSpace(np.ImageURL),
	}
}

// ToCleanNewsPoint converts a validated NewsPoint to CleanNewsPoint
func (p *NewsProcessor) ToCleanNewsPoint(np models.NewsPoint, dataPointID string) models.CleanNewsPoint {
	return models.CleanNewsPoint{
		ID:             np.ID,
		Topic:          np.Topic,
		SubTopic:       np.SubTopic,
		FetchTimestamp: np.FetchTimestamp,
		ContentHash:    np.ContentHash,
		Title:          np.Title,
		URL:            np.URL,
		Description:    np.Description,
		PublishedAt:    np.PublishedAt,
		SourceName:     np.SourceName,
		Author:         np.Author,
		ImageURL:       np.ImageURL,
		DataPointID:    dataPointID,
	}
}

// cleanText removes extra whitespace and trims the text
func cleanText(s string) string {
	// Trim leading/trailing whitespace
	s = strings.TrimSpace(s)
	// Replace multiple spaces with single space
	s = strings.Join(strings.Fields(s), " ")
	return s
}
