package client

import (
	"context"
	"encoding/json"
	"fmt"
	"ingestor/internal/db"
	"io"
	"net/http"
	"net/url"
	"time"
)

type BackendClient struct {
	BackendURL string
	http       *http.Client
}

type backendResponse struct {
	Topics []backendTopic `json:"topics"`
}

type backendTopic struct {
	TopicID   int               `json:"id"`
	TopicName string            `json:"name"`
	TopicSlug string            `json:"slug"`
	SubTopics []backendSubTopic `json:"subTopics"`
}

type backendSubTopic struct {
	SubTopicID   int    `json:"id"`
	SubTopicName string `json:"name"`
	SubTopicSlug string `json:"slug"`
}

func NewBackendClient(BackendURL string) *BackendClient {
	return &BackendClient{
		BackendURL: BackendURL,
		http: &http.Client{
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 10,
			},
			Timeout: 5 * time.Second,
		},
	}
}

func (client *BackendClient) GetAllTopics(ctx context.Context) ([]db.Topic, error) {
	backendURL, err := url.Parse(client.BackendURL + "/api/topics/all-topics")
	if err != nil {
		return nil, fmt.Errorf("invalid backend URL: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, backendURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	req.Header.Set("X-Origin", "Ingest")

	resp, err := client.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request to backend: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %w", err)
	}

	var backendResp backendResponse
	if err := json.Unmarshal(body, &backendResp); err != nil {
		return nil, fmt.Errorf("error decoding backend response: %w", err)
	}

	topics := make([]db.Topic, len(backendResp.Topics))
	for i, backendTopic := range backendResp.Topics {
		subTopics := make([]db.SubTopic, len(backendTopic.SubTopics))
		for j, backendSubTopic := range backendTopic.SubTopics {
			subTopics[j] = db.SubTopic{
				SubTopicID:   backendSubTopic.SubTopicID,
				SubTopicName: backendSubTopic.SubTopicName,
				SubTopicSlug: backendSubTopic.SubTopicSlug,
			}
		}
		topics[i] = db.Topic{
			TopicID:   backendTopic.TopicID,
			TopicName: backendTopic.TopicName,
			TopicSlug: backendTopic.TopicSlug,
			SubTopics: subTopics,
		}
	}

	return topics, nil
}
