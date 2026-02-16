package client

import (
	"context"
	"encoding/json"
	"fmt"
	"ingestor/internal/models"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type YouTubeVideo struct {
	VideoID      string
	ChannelID    string
	ChannelTitle string
	Title        string
	Description  string
	ThumbnailURL string
	PublishedAt  string
	Duration     string
	ViewCount    int64
	LikeCount    int64
}

type SubTopicVideo struct {
	SubTopic models.SubTopic
	Video    YouTubeVideo
}

type YouTubeClient struct {
	BaseURL    string
	APIKey     string
	MaxResults int
	http       *http.Client
}

type youtubeSearchResponse struct {
	Items []struct {
		ID struct {
			VideoID string `json:"videoId"`
		} `json:"id"`
		Snippet struct {
			ChannelID    string `json:"channelId"`
			ChannelTitle string `json:"channelTitle"`
			Title        string `json:"title"`
			Description  string `json:"description"`
			PublishedAt  string `json:"publishedAt"`
			Thumbnails   struct {
				High struct {
					URL string `json:"url"`
				} `json:"high"`
				Default struct {
					URL string `json:"url"`
				} `json:"default"`
			} `json:"thumbnails"`
		} `json:"snippet"`
	} `json:"items"`
}

type youtubeVideosResponse struct {
	Items []struct {
		ID             string `json:"id"`
		ContentDetails struct {
			Duration string `json:"duration"`
		} `json:"contentDetails"`
		Statistics struct {
			ViewCount string `json:"viewCount"`
			LikeCount string `json:"likeCount"`
		} `json:"statistics"`
	} `json:"items"`
}

type youtubeVideoDetails struct {
	Duration  string
	ViewCount int64
	LikeCount int64
}

func NewYouTubeClient(apiKey string, maxResults int) *YouTubeClient {
	return &YouTubeClient{
		BaseURL:    "https://www.googleapis.com/youtube/v3",
		APIKey:     apiKey,
		MaxResults: maxResults,
		http: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 10,
			},
		},
	}
}

func (c *YouTubeClient) GetVideos(ctx context.Context, subtopics []models.SubTopic) []SubTopicVideo {
	start := time.Now()
	log.Printf("event=youtube_fetch_start service=ingestor subtopic_count=%d", len(subtopics))
	videos := make([]SubTopicVideo, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, st := range subtopics {
		subtopic := st
		wg.Add(1)
		go func() {
			defer wg.Done()
			subStart := time.Now()
			subtopicVideos := c.searchVideosByQuery(ctx, subtopic.Slug)
			log.Printf(
				"event=youtube_subtopic_fetch_ok service=ingestor subtopic_slug=%s video_count=%d latency_ms=%d",
				subtopic.Slug, len(subtopicVideos), time.Since(subStart).Milliseconds(),
			)

			if len(subtopicVideos) == 0 {
				return
			}
			mu.Lock()
			for _, video := range subtopicVideos {
				videos = append(videos, SubTopicVideo{
					SubTopic: subtopic,
					Video:    video,
				})
			}
			mu.Unlock()
		}()
	}
	wg.Wait()

	log.Printf(
		"event=youtube_fetch_done service=ingestor subtopic_count=%d video_count=%d latency_ms=%d",
		len(subtopics), len(videos), time.Since(start).Milliseconds(),
	)
	return videos
}

func (c *YouTubeClient) searchVideosByQuery(ctx context.Context, query string) []YouTubeVideo {
	start := time.Now()
	searchQuery := strings.ReplaceAll(query, "-", " ")
	u, _ := url.Parse(c.BaseURL + "/search")
	q := u.Query()
	q.Set("part", "snippet")
	q.Set("q", searchQuery)
	q.Set("type", "video")
	q.Set("order", "relevance")
	q.Set("maxResults", strconv.Itoa(c.MaxResults))
	q.Set("key", c.APIKey)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		log.Printf("event=youtube_search_err service=ingestor query=%q error=%q", searchQuery, err.Error())
		return []YouTubeVideo{}
	}

	resp, err := c.http.Do(req)
	if err != nil {
		log.Printf("event=youtube_search_err service=ingestor query=%q error=%q", searchQuery, err.Error())
		return []YouTubeVideo{}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("event=youtube_search_http_err service=ingestor query=%q status=%d body=%q", searchQuery, resp.StatusCode, string(body))
		return []YouTubeVideo{}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("event=youtube_search_err service=ingestor query=%q error=%q", searchQuery, err.Error())
		return []YouTubeVideo{}
	}

	var searchResp youtubeSearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		log.Printf("event=youtube_search_err service=ingestor query=%q error=%q", searchQuery, err.Error())
		return []YouTubeVideo{}
	}

	videoIDs := make([]string, 0, len(searchResp.Items))
	for _, item := range searchResp.Items {
		if item.ID.VideoID != "" {
			videoIDs = append(videoIDs, item.ID.VideoID)
		}
	}

	detailsByID := c.fetchVideoDetails(ctx, videoIDs)

	videos := make([]YouTubeVideo, 0, len(searchResp.Items))
	for _, item := range searchResp.Items {
		videoID := item.ID.VideoID
		if videoID == "" {
			continue
		}

		thumbnailURL := item.Snippet.Thumbnails.High.URL
		if thumbnailURL == "" {
			thumbnailURL = item.Snippet.Thumbnails.Default.URL
		}

		details := detailsByID[videoID]
		videos = append(videos, YouTubeVideo{
			VideoID:      videoID,
			ChannelID:    item.Snippet.ChannelID,
			ChannelTitle: item.Snippet.ChannelTitle,
			Title:        item.Snippet.Title,
			Description:  item.Snippet.Description,
			ThumbnailURL: thumbnailURL,
			PublishedAt:  item.Snippet.PublishedAt,
			Duration:     details.Duration,
			ViewCount:    details.ViewCount,
			LikeCount:    details.LikeCount,
		})
	}

	log.Printf(
		"event=youtube_search_ok service=ingestor query=%q result_count=%d latency_ms=%d",
		searchQuery, len(videos), time.Since(start).Milliseconds(),
	)
	return videos
}

func (c *YouTubeClient) fetchVideoDetails(ctx context.Context, videoIDs []string) map[string]youtubeVideoDetails {
	if len(videoIDs) == 0 {
		return map[string]youtubeVideoDetails{}
	}

	u, _ := url.Parse(c.BaseURL + "/videos")
	q := u.Query()
	q.Set("part", "contentDetails,statistics")
	q.Set("id", strings.Join(videoIDs, ","))
	q.Set("key", c.APIKey)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return map[string]youtubeVideoDetails{}
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return map[string]youtubeVideoDetails{}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return map[string]youtubeVideoDetails{}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]youtubeVideoDetails{}
	}

	var videosResp youtubeVideosResponse
	if err := json.Unmarshal(body, &videosResp); err != nil {
		return map[string]youtubeVideoDetails{}
	}

	out := make(map[string]youtubeVideoDetails, len(videosResp.Items))
	for _, item := range videosResp.Items {
		viewCount, _ := strconv.ParseInt(item.Statistics.ViewCount, 10, 64)
		likeCount, _ := strconv.ParseInt(item.Statistics.LikeCount, 10, 64)
		out[item.ID] = youtubeVideoDetails{
			Duration:  item.ContentDetails.Duration,
			ViewCount: viewCount,
			LikeCount: likeCount,
		}
	}

	return out
}

func (v YouTubeVideo) URL() string {
	return fmt.Sprintf("https://www.youtube.com/watch?v=%s", v.VideoID)
}
