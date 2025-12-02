package client

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Article struct {
	Source struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"source"`
	Author      string `json:"author"`
	Title       string `json:"title"`
	Description string `json:"description"`
	URL         string `json:"url"`
	URLToImage  string `json:"urlToImage"`
	Content     string `json:"content"`
	PublishedAt string `json:"publishedAt"`
}

type NewsResponse struct {
	Status       string    `json:"status"`
	TotalResults int       `json:"totalResults"`
	Articles     []Article `json:"articles"`
}

type NewsAPIClient struct {
	BaseURL string
	APIKey  string
	http    *http.Client
}

type MultiNewsClient struct {
	clients []*NewsAPIClient
	mu      sync.Mutex
	index   int
}

func NewMultiNewsClient(apiKey1, apiKey2, apiKey3 string) *MultiNewsClient {

	return &MultiNewsClient{
		clients: []*NewsAPIClient{
			NewNewsAPIClient("https://newsapi.org/v2", apiKey1),
			NewNewsAPIClient("https://newsapi.org/v2", apiKey2),
			NewNewsAPIClient("https://newsapi.org/v2", apiKey3),
		},
	}
}

func NewNewsAPIClient(baseURL, apiKey string) *NewsAPIClient {
	return &NewsAPIClient{
		BaseURL: baseURL,
		APIKey:  apiKey,
		http: &http.Client{
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 10,
			},
			Timeout: 10 * time.Second,
		},
	}
}

func (client *MultiNewsClient) GetArticles(ctx context.Context, query string) []Article {
	client.mu.Lock()
	defer client.mu.Unlock()
	// round robin
	client.index = (client.index + 1) % len(client.clients)
	return client.clients[client.index].GetAllArticles(ctx, query)
}

func (client *NewsAPIClient) GetAllArticles(ctx context.Context, query string) []Article {
	var Articles []Article

	var mu sync.Mutex
	keywords := strings.Split(query, "-")

	var wg sync.WaitGroup

	for _, keyword := range keywords {
		wg.Add(1)
		go func(kw string) {
			defer wg.Done()
			kw = strings.TrimSpace(kw)
			result, err := client.GetEverythingRelevant(ctx, kw)
			time.Sleep(1 * time.Second)
			if err != nil {
				return
			}
			mu.Lock()
			Articles = append(Articles, result.Articles...)
			mu.Unlock()
		}(keyword)
	}

	wg.Wait()
	return Articles

}

func (client *NewsAPIClient) GetEverythingRelevant(ctx context.Context, query string) (*NewsResponse, error) {
	u, _ := url.Parse(client.BaseURL + "/everything")
	q := u.Query()
	q.Set("q", query)
	q.Set("searchIn", "title")
	q.Set("sortBy", "relevancy")
	q.Set("language", "en")
	q.Set("apiKey", client.APIKey)

	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("NewsAPI Error : %s", string(body))
	}

	var result NewsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil

}
