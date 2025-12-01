package client

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
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

func (client *NewsAPIClient) GetAllArticles(ctx context.Context, query string) *[]Article {
	var Articles []Article

	keywords := strings.Split(query, "-")

	for _, keyword := range keywords {
		keyword = strings.TrimSpace(keyword)
		log.Println(keyword)
		result, err := client.GetEverythingRelevant(ctx, keyword)
		if err != nil {
			continue
		}
		Articles = append(Articles, result.Articles...)
	}

	return &Articles

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
