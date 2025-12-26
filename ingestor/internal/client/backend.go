package client

import (
	"context"
	"encoding/json"
	"fmt"
	"ingestor/internal/models"
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
	ID        int               `json:"id"`
	Name      string            `json:"name"`
	Slug      string            `json:"slug"`
	SubTopics []backendSubTopic `json:"subTopics"`
}

type backendSubTopic struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
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

func (c *BackendClient) GetAllTopics(ctx context.Context) ([]models.Topic, error) {
	backendURL, err := url.Parse(c.BackendURL + "/api/topics/all-topics")
	if err != nil {
		return nil, fmt.Errorf("invalid backend URL: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, backendURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	req.Header.Set("X-Origin", "Ingest")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading body: %w", err)
	}

	var backendResp backendResponse
	if err := json.Unmarshal(body, &backendResp); err != nil {
		return nil, fmt.Errorf("error decoding: %w", err)
	}

	topics := make([]models.Topic, len(backendResp.Topics))
	for i, bt := range backendResp.Topics {
		subTopics := make([]models.SubTopic, len(bt.SubTopics))
		for j, bst := range bt.SubTopics {
			subTopics[j] = models.SubTopic{
				ID:   bst.ID,
				Name: bst.Name,
				Slug: bst.Slug,
			}
		}
		topics[i] = models.Topic{
			ID:        bt.ID,
			Name:      bt.Name,
			Slug:      bt.Slug,
			SubTopics: subTopics,
		}
	}

	if len(topics) > 2 {
		topics = topics[:2]
	}

	return topics, nil
}
