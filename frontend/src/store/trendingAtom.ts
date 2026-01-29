import { atom } from "jotai";
import type { FeedItem, DataType } from "../api/feed";
import type { TimeRange } from "../api/trending";

export interface TrendingFilters {
  topicId?: number;
  subTopicId?: number;
  type?: DataType;
  timeRange: TimeRange;
}

// Trending items state
export const trendingItemsAtom = atom<FeedItem[]>([]);

// Trending filters (default to 24h time range)
export const trendingFiltersAtom = atom<TrendingFilters>({
  timeRange: "24h",
});

// Loading and error states
export const trendingLoadingAtom = atom<boolean>(false);
export const trendingErrorAtom = atom<string | null>(null);

// Derived atom for current time range
export const trendingTimeRangeAtom = atom<TimeRange>((get) => {
  const filters = get(trendingFiltersAtom);
  return filters.timeRange;
});

// Action atom to update trending filters
export const updateTrendingFiltersAtom = atom(
  null,
  (get, set, newFilters: Partial<TrendingFilters>) => {
    const currentFilters = get(trendingFiltersAtom);
    set(trendingFiltersAtom, { ...currentFilters, ...newFilters });
  }
);

// Action atom to reset trending feed
export const resetTrendingFeedAtom = atom(null, (_get, set) => {
  set(trendingItemsAtom, []);
  set(trendingErrorAtom, null);
});

// Action atom to set time range (convenience helper)
export const setTimeRangeAtom = atom(null, (get, set, timeRange: TimeRange) => {
  const currentFilters = get(trendingFiltersAtom);
  set(trendingFiltersAtom, { ...currentFilters, timeRange });
});
