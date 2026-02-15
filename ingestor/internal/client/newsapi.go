package client

import (
	"context"
	"encoding/json"
	"fmt"
	"ingestor/internal/models"
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
}

type SubTopicArticle struct {
	SubTopic models.SubTopic
	Article  Article
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

func (c *MultiNewsClient) GetArticles(ctx context.Context, subtopics []models.SubTopic) []SubTopicArticle {
	var articles []SubTopicArticle
	var mu sync.Mutex
	var wg sync.WaitGroup

	jobChan := make(chan models.SubTopic, len(subtopics))

	for _, subtopic := range subtopics {
		jobChan <- subtopic
	}
	close(jobChan)

	for _, client := range c.clients {
		wg.Add(1)
		go func(client *NewsAPIClient) {
			defer wg.Done()
			for subtopic := range jobChan {
				newArticles := client.GetAllArticles(ctx, subtopic.Slug)

				if len(newArticles) > 0 {
					mu.Lock()
					for _, article := range newArticles {
						articles = append(articles, SubTopicArticle{
							SubTopic: subtopic,
							Article:  article,
						})
					}
					mu.Unlock()
				}
			}
		}(client)
	}

	wg.Wait()
	return articles
}

func (c *NewsAPIClient) GetAllArticles(ctx context.Context, query string) []Article {
	searchQuery := strings.ReplaceAll(query, "-", " ")

	response, err := c.GetEverythingRelevant(ctx, searchQuery)
	if err != nil {
		fmt.Printf("Error fetching for %s : %v\n", searchQuery, err)
		return []Article{}
	}

	return response.Articles
}

func (c *NewsAPIClient) GetEverythingRelevant(ctx context.Context, query string) (*NewsResponse, error) {
	u, _ := url.Parse(c.BaseURL + "/everything")
	q := u.Query()
	q.Set("q", query)
	q.Set("searchIn", "title")
	q.Set("sortBy", "relevancy")
	q.Set("language", "en")
	q.Set("apiKey", c.APIKey)

	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
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
