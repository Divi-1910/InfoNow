import axiosInstance from "../lib/axios";
import type { DataType, FeedItem, FeedPagination } from "./feed";

export type TimeRange = "24h" | "7d" | "30d";

export interface TrendingParams {
  topicId?: number;
  subTopicId?: number;
  type?: DataType;
  limit?: number;
  timeRange?: TimeRange;
  topicLimit?: number;
}

export interface TrendingTopic {
  id: number;
  name: string;
  slug: string;
  count: number;
  score: number;
}

export interface TrendingResponse {
  items: FeedItem[];
  trendingTopics: TrendingTopic[];
  pagination: FeedPagination;
  timeRange: TimeRange;
}

/**
 * Get trending/popular content
 */
export const getTrending = async (params: TrendingParams = {}): Promise<TrendingResponse> => {
  const response = await axiosInstance.get<TrendingResponse>("/api/trending", { params });
  return response.data;
};
