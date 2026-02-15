package client

import (
	"context"
	"encoding/json"
	"fmt"
	"ingestor/internal/models"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
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
	videos := make([]SubTopicVideo, 0)
	for _, subtopic := range subtopics {
		subtopicVideos := c.searchVideosByQuery(ctx, subtopic.Slug)
		for _, video := range subtopicVideos {
			videos = append(videos, SubTopicVideo{
				SubTopic: subtopic,
				Video:    video,
			})
		}
	}
	return videos
}

func (c *YouTubeClient) searchVideosByQuery(ctx context.Context, query string) []YouTubeVideo {
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
		return []YouTubeVideo{}
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return []YouTubeVideo{}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return []YouTubeVideo{}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return []YouTubeVideo{}
	}

	var searchResp youtubeSearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
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
