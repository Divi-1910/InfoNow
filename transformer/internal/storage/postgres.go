package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"transformer/internal/models"

	_ "github.com/lib/pq"
)

type PostgresStorage struct {
	db *sql.DB
}

func NewPostgresStorage(databaseURL string) (*PostgresStorage, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return &PostgresStorage{db: db}, nil
}

// SaveNewsArticle saves a news article to the database and returns the DataPoint ID
func (s *PostgresStorage) SaveNewsArticle(ctx context.Context, np models.NewsPoint) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// First, get topic and subtopic IDs if they exist
	var topicID, subTopicID *int
	if np.Topic != "" {
		var tid int
		err := tx.QueryRowContext(ctx,
			`SELECT id FROM "Topic" WHERE slug = $1`,
			np.Topic,
		).Scan(&tid)
		if err == nil {
			topicID = &tid
		}
	}
	if np.SubTopic != "" {
		var stid int
		err := tx.QueryRowContext(ctx,
			`SELECT id FROM "SubTopic" WHERE slug = $1`,
			np.SubTopic,
		).Scan(&stid)
		if err == nil {
			subTopicID = &stid
		}
	}

	// Insert DataPoint
	var dataPointID string
	err = tx.QueryRowContext(ctx,
		`INSERT INTO "DataPoint" (id, type, "contentHash", "topicId", "subTopicId", "fetchedAt", "createdAt")
		 VALUES (gen_random_uuid(), 'News', $1, $2, $3, $4, NOW())
		 RETURNING id`,
		np.ContentHash, topicID, subTopicID, np.FetchTimestamp,
	).Scan(&dataPointID)
	if err != nil {
		return "", fmt.Errorf("failed to insert DataPoint: %w", err)
	}

	// Insert RawNewsArticle
	_, err = tx.ExecContext(ctx,
		`INSERT INTO "RawNewsArticle" (id, "dataId", title, url, description, "publishedAt", "sourceName", author, "imageUrl")
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
		dataPointID,
		np.Title,
		np.URL,
		nullString(np.Description),
		np.PublishedAt,
		nullString(np.SourceName),
		nullString(np.Author),
		nullString(np.ImageURL),
	)
	if err != nil {
		return "", fmt.Errorf("failed to insert RawNewsArticle: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	return dataPointID, nil
}

// SaveNewsArticleWithOutbox saves a news article and creates an outbox event in a single transaction
// This ensures reliable message delivery - if the transaction commits, the message will be published
func (s *PostgresStorage) SaveNewsArticleWithOutbox(ctx context.Context, np models.NewsPoint, kafkaTopic string) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// First, get topic and subtopic IDs if they exist
	var topicID, subTopicID *int
	if np.Topic != "" {
		var tid int
		err := tx.QueryRowContext(ctx,
			`SELECT id FROM "Topic" WHERE slug = $1`,
			np.Topic,
		).Scan(&tid)
		if err == nil {
			topicID = &tid
		}
	}
	if np.SubTopic != "" {
		var stid int
		err := tx.QueryRowContext(ctx,
			`SELECT id FROM "SubTopic" WHERE slug = $1`,
			np.SubTopic,
		).Scan(&stid)
		if err == nil {
			subTopicID = &stid
		}
	}

	// 1. Insert DataPoint
	var dataPointID string
	err = tx.QueryRowContext(ctx,
		`INSERT INTO "DataPoint" (id, type, "contentHash", "topicId", "subTopicId", "fetchedAt", "createdAt")
		 VALUES (gen_random_uuid(), 'News', $1, $2, $3, $4, NOW())
		 RETURNING id`,
		np.ContentHash, topicID, subTopicID, np.FetchTimestamp,
	).Scan(&dataPointID)
	if err != nil {
		return "", fmt.Errorf("failed to insert DataPoint: %w", err)
	}

	// 2. Insert RawNewsArticle
	_, err = tx.ExecContext(ctx,
		`INSERT INTO "RawNewsArticle" (id, "dataId", title, url, description, "publishedAt", "sourceName", author, "imageUrl")
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
		dataPointID,
		np.Title,
		np.URL,
		nullString(np.Description),
		np.PublishedAt,
		nullString(np.SourceName),
		nullString(np.Author),
		nullString(np.ImageURL),
	)
	if err != nil {
		return "", fmt.Errorf("failed to insert RawNewsArticle: %w", err)
	}

	// 3. Create CleanNewsPoint and insert OutboxEvent in same transaction
	cleanPoint := models.CleanNewsPoint{
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

	payload, err := json.Marshal(cleanPoint)
	if err != nil {
		return "", fmt.Errorf("failed to marshal CleanNewsPoint: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO "OutboxEvent"
		 (id, "aggregateType", "aggregateId", "eventType", topic, payload, processed, "retryCount", "maxRetries", "createdAt")
		 VALUES (gen_random_uuid(), 'news', $1, 'NewsArticleCreated', $2, $3, false, 0, 3, NOW())`,
		dataPointID, kafkaTopic, payload,
	)
	if err != nil {
		return "", fmt.Errorf("failed to insert OutboxEvent: %w", err)
	}

	// 4. Commit all three writes atomically
	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	return dataPointID, nil
}

// SaveYoutubeVideoWithOutbox saves a youtube video and creates an outbox event in a single transaction
func (s *PostgresStorage) SaveYoutubeVideoWithOutbox(ctx context.Context, yp models.YoutubePoint, kafkaTopic string) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	var topicID, subTopicID *int
	if yp.Topic != "" {
		var tid int
		err := tx.QueryRowContext(ctx, `SELECT id FROM "Topic" WHERE slug = $1`, yp.Topic).Scan(&tid)
		if err == nil {
			topicID = &tid
		}
	}
	if yp.SubTopic != "" {
		var stid int
		err := tx.QueryRowContext(ctx, `SELECT id FROM "SubTopic" WHERE slug = $1`, yp.SubTopic).Scan(&stid)
		if err == nil {
			subTopicID = &stid
		}
	}

	var dataPointID string
	err = tx.QueryRowContext(ctx,
		`INSERT INTO "DataPoint" (id, type, "contentHash", "topicId", "subTopicId", "fetchedAt", "createdAt")
		 VALUES (gen_random_uuid(), 'Youtube', $1, $2, $3, $4, NOW())
		 RETURNING id`,
		yp.ContentHash, topicID, subTopicID, yp.FetchTimestamp,
	).Scan(&dataPointID)
	if err != nil {
		return "", fmt.Errorf("failed to insert DataPoint: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO "RawYoutubeVideo" (id, "dataId", "videoId", "channelId", "channelTitle", title, description, "thumbnailUrl", "publishedAt", duration, "viewCount", "likeCount")
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		dataPointID,
		yp.VideoID,
		yp.ChannelID,
		yp.ChannelTitle,
		yp.Title,
		nullString(yp.Description),
		nullString(yp.ThumbnailURL),
		yp.PublishedAt,
		nullString(yp.Duration),
		yp.ViewCount,
		yp.LikeCount,
	)
	if err != nil {
		return "", fmt.Errorf("failed to insert RawYoutubeVideo: %w", err)
	}

	cleanPoint := models.CleanYoutubePoint{
		ID:             yp.ID,
		Topic:          yp.Topic,
		SubTopic:       yp.SubTopic,
		FetchTimestamp: yp.FetchTimestamp,
		ContentHash:    yp.ContentHash,
		VideoID:        yp.VideoID,
		ChannelID:      yp.ChannelID,
		ChannelTitle:   yp.ChannelTitle,
		Title:          yp.Title,
		Description:    yp.Description,
		ThumbnailURL:   yp.ThumbnailURL,
		PublishedAt:    yp.PublishedAt,
		Duration:       yp.Duration,
		ViewCount:      yp.ViewCount,
		LikeCount:      yp.LikeCount,
		DataPointID:    dataPointID,
	}

	payload, err := json.Marshal(cleanPoint)
	if err != nil {
		return "", fmt.Errorf("failed to marshal CleanYoutubePoint: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO "OutboxEvent"
		 (id, "aggregateType", "aggregateId", "eventType", topic, payload, processed, "retryCount", "maxRetries", "createdAt")
		 VALUES (gen_random_uuid(), 'youtube', $1, 'YoutubeVideoCreated', $2, $3, false, 0, 3, NOW())`,
		dataPointID, kafkaTopic, payload,
	)
	if err != nil {
		return "", fmt.Errorf("failed to insert OutboxEvent: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	return dataPointID, nil
}

// SaveRawApiResponse saves the raw API response for replay capability
func (s *PostgresStorage) SaveRawApiResponse(ctx context.Context, sourceType string, payload []byte) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO "RawApiResponse" (id, "sourceType", payload, "receivedAt")
		 VALUES (gen_random_uuid(), $1, $2, NOW())`,
		sourceType, payload,
	)
	return err
}

// CheckURLExists checks if a URL already exists in the database
func (s *PostgresStorage) CheckURLExists(ctx context.Context, url string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM "RawNewsArticle" WHERE url = $1)`,
		url,
	).Scan(&exists)
	return exists, err
}

// CheckVideoIDExists checks if a youtube video_id already exists in the database
func (s *PostgresStorage) CheckVideoIDExists(ctx context.Context, videoID string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM "RawYoutubeVideo" WHERE "videoId" = $1)`,
		videoID,
	).Scan(&exists)
	return exists, err
}

func (s *PostgresStorage) Close() error {
	return s.db.Close()
}

// DB returns the underlying database connection for use by other components
func (s *PostgresStorage) DB() *sql.DB {
	return s.db
}

// nullString returns nil if string is empty, otherwise returns the string pointer
func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
