import axiosInstance from "../lib/axios";
import type { FeedParams, FeedResponse } from "./feed";

export interface SaveResponse {
  saved: boolean;
  savedAt?: string;
}

export interface SavedIdsResponse {
  savedIds: string[];
}

/**
 * Save an item to user's saved list
 */
export const saveItem = async (dataPointId: string): Promise<SaveResponse> => {
  const response = await axiosInstance.post<SaveResponse>(`/api/saved/${dataPointId}`);
  return response.data;
};

/**
 * Remove an item from user's saved list
 */
export const unsaveItem = async (dataPointId: string): Promise<SaveResponse> => {
  const response = await axiosInstance.delete<SaveResponse>(`/api/saved/${dataPointId}`);
  return response.data;
};

/**
 * Get user's saved items with pagination and filters
 */
export const getSavedItems = async (params: FeedParams = {}): Promise<FeedResponse> => {
  const response = await axiosInstance.get<FeedResponse>("/api/saved", { params });
  return response.data;
};

/**
 * Get IDs of all saved items (for checking save status in feed)
 */
export const getSavedIds = async (): Promise<string[]> => {
  const response = await axiosInstance.get<SavedIdsResponse>("/api/saved/ids");
  return response.data.savedIds;
};
