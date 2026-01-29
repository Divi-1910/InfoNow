import axiosInstance from "../lib/axios";

// Types for feed API
export type DataType = "News" | "Reddit" | "Youtube";

export interface FeedFilters {
  mode?: "personalized" | "browse";
  topicId?: number;
  subTopicId?: number;
  type?: DataType;
  dateFrom?: string;
  dateTo?: string;
}

export interface FeedParams extends FeedFilters {
  cursor?: string;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

export interface TopicInfo {
  id: number;
  name: string;
  slug: string;
}

export interface NewsContent {
  title: string;
  url: string;
  description: string | null;
  publishedAt: string;
  sourceName: string | null;
  author: string | null;
  imageUrl: string | null;
}

export interface RedditContent {
  postId: string;
  subreddit: string;
  title: string;
  selftext: string | null;
  author: string;
  score: number;
  numComments: number;
  permalink: string;
  createdUtc: string;
  thumbnail: string | null;
}

export interface YoutubeContent {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
}

export interface EnrichedInfo {
  summary: string | null;
  hasFullContent: boolean;
}

export interface FeedItem {
  id: string;
  type: DataType;
  fetchedAt: string;
  topic: TopicInfo | null;
  subTopic: TopicInfo | null;
  content: NewsContent | RedditContent | YoutubeContent;
  enriched?: EnrichedInfo;
  isSaved?: boolean;
  savedAt?: string;
}

export interface FeedPagination {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FeedResponse {
  items: FeedItem[];
  pagination: FeedPagination;
  message?: string;
}

/**
 * Fetch feed items from the API
 */
export const getFeed = async (params: FeedParams = {}): Promise<FeedResponse> => {
  const response = await axiosInstance.get<FeedResponse>("/api/feed", { params });
  return response.data;
};

/**
 * Type guard to check if content is NewsContent
 */
export const isNewsContent = (content: FeedItem["content"]): content is NewsContent => {
  return "url" in content && "sourceName" in content;
};

/**
 * Type guard to check if content is RedditContent
 */
export const isRedditContent = (content: FeedItem["content"]): content is RedditContent => {
  return "subreddit" in content && "score" in content;
};

/**
 * Type guard to check if content is YoutubeContent
 */
export const isYoutubeContent = (content: FeedItem["content"]): content is YoutubeContent => {
  return "videoId" in content && "channelTitle" in content;
};
