package service

import (
	"context"
	"fmt"
	"ingestor/internal/client"
	"ingestor/internal/config"
	"ingestor/internal/deduper"
	"ingestor/internal/ingest"
	"ingestor/internal/models"
	"ingestor/internal/producer"
	"ingestor/internal/redis"
	"strings"
	"time"
)

const (
	SourceAll     = "all"
	SourceNews    = "news"
	SourceYoutube = "youtube"
	SourceYT      = "yt"
)

// RunRequest defines one ingestion execution request.
type RunRequest struct {
	All      bool   `json:"all"`
	Topic    string `json:"topic,omitempty"`
	SubTopic string `json:"subtopic,omitempty"`
	Source   string `json:"source,omitempty"` // all|news|youtube|yt
}

// RunResult captures execution metadata and per-source stats.
type RunResult struct {
	Request   RunRequest         `json:"request"`
	News      *ingest.CycleStats `json:"news,omitempty"`
	YouTube   *ingest.CycleStats `json:"youtube,omitempty"`
	StartedAt time.Time          `json:"started_at"`
	EndedAt   time.Time          `json:"ended_at"`
	Duration  time.Duration      `json:"duration"`
}

type Service struct {
	cfg           *config.Config
	redisClient   *redis.RedisClient
	kafkaProducer *producer.KafkaProducer
	backendClient *client.BackendClient
	newsIngestor  *ingest.NewsIngestor
	ytIngestor    *ingest.YTIngestor
}

func New(cfg *config.Config) *Service {
	redisClient := redis.NewRedisClient(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	dup := deduper.New(redisClient, 14*24*time.Hour)

	backendClient := client.NewBackendClient(cfg.BackendURL)
	newsClient := client.NewMultiNewsClient(cfg.NewsAPIKey1, cfg.NewsAPIKey2, cfg.NewsAPIKey3)
	ytClient := client.NewYouTubeClient(cfg.YouTubeAPIKey, cfg.YouTubeMaxResults)

	kafkaProducer := producer.NewKafkaProducer(cfg.KafkaBrokers)

	newsIngestor := ingest.NewNewsIngestor(
		backendClient,
		newsClient,
		dup,
		kafkaProducer,
		cfg.NewsMaxPerTopic,
		cfg.OperationTimeout,
	)
	ytIngestor := ingest.NewYTIngestor(backendClient, ytClient, dup, kafkaProducer)

	return &Service{
		cfg:           cfg,
		redisClient:   redisClient,
		kafkaProducer: kafkaProducer,
		backendClient: backendClient,
		newsIngestor:  newsIngestor,
		ytIngestor:    ytIngestor,
	}
}

func (s *Service) Close() error {
	var errs []string
	if s.kafkaProducer != nil {
		if err := s.kafkaProducer.Close(); err != nil {
			errs = append(errs, err.Error())
		}
	}
	if s.redisClient != nil {
		s.redisClient.Close()
	}
	if len(errs) > 0 {
		return fmt.Errorf("close errors: %s", strings.Join(errs, "; "))
	}
	return nil
}

func (s *Service) ScheduledInterval() time.Duration {
	return s.cfg.ScheduledInterval
}

func (s *Service) Run(ctx context.Context, req RunRequest) (RunResult, error) {
	normalizedSource, err := normalizeSource(req.Source)
	if err != nil {
		return RunResult{}, err
	}
	req.Source = normalizedSource
	req.Topic = strings.TrimSpace(req.Topic)
	req.SubTopic = strings.TrimSpace(req.SubTopic)

	if req.All && req.Topic != "" {
		return RunResult{}, fmt.Errorf("cannot set both all=true and topic")
	}

	topics, err := s.resolveTopics(ctx, req)
	if err != nil {
		return RunResult{}, err
	}

	start := time.Now().UTC()
	result := RunResult{
		Request:   req,
		StartedAt: start,
	}

	switch normalizedSource {
	case SourceAll:
		newsStats := s.newsIngestor.RunWithTopics(ctx, topics)
		ytStats := s.ytIngestor.RunWithTopics(ctx, topics)
		result.News = &newsStats
		result.YouTube = &ytStats
	case SourceNews:
		newsStats := s.newsIngestor.RunWithTopics(ctx, topics)
		result.News = &newsStats
	case SourceYoutube:
		ytStats := s.ytIngestor.RunWithTopics(ctx, topics)
		result.YouTube = &ytStats
	}

	result.EndedAt = time.Now().UTC()
	result.Duration = result.EndedAt.Sub(start)
	return result, nil
}

func normalizeSource(source string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(source))
	if s == "" {
		return SourceAll, nil
	}
	switch s {
	case SourceAll, SourceNews, SourceYoutube:
		return s, nil
	case SourceYT:
		return SourceYoutube, nil
	default:
		return "", fmt.Errorf("invalid source %q (allowed: all, news, youtube)", source)
	}
}

func (s *Service) resolveTopics(ctx context.Context, req RunRequest) ([]models.Topic, error) {
	if req.All || strings.TrimSpace(req.Topic) == "" {
		topics, err := s.backendClient.GetAllTopics(ctx)
		if err != nil {
			return nil, fmt.Errorf("fetch backend topics: %w", err)
		}
		return topics, nil
	}

	topicName := strings.TrimSpace(req.Topic)
	topicSlug := toSlug(topicName)
	if topicSlug == "" {
		return nil, fmt.Errorf("topic is required")
	}

	subTopicName := strings.TrimSpace(req.SubTopic)
	if subTopicName == "" {
		subTopicName = topicName
	}
	subTopicSlug := toSlug(subTopicName)
	if subTopicSlug == "" {
		subTopicSlug = topicSlug
	}

	topics := []models.Topic{
		{
			Name: topicName,
			Slug: topicSlug,
			SubTopics: []models.SubTopic{
				{
					Name: subTopicName,
					Slug: subTopicSlug,
				},
			},
		},
	}
	return topics, nil
}

func toSlug(input string) string {
	s := strings.ToLower(strings.TrimSpace(input))
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "_", " ")
	parts := strings.Fields(s)
	return strings.Join(parts, "-")
}
