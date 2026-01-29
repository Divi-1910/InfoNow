import { atom } from "jotai";
import type { FeedItem, FeedFilters, DataType } from "../api/feed";

// Feed filters state
export const feedFiltersAtom = atom<FeedFilters>({
  mode: "personalized",
});

// Feed items state
export const feedItemsAtom = atom<FeedItem[]>([]);

// Pagination state
export const feedCursorAtom = atom<string | null>(null);
export const feedHasMoreAtom = atom<boolean>(true);

// Loading states
export const feedLoadingAtom = atom<boolean>(false);
export const feedLoadingMoreAtom = atom<boolean>(false);

// Error state
export const feedErrorAtom = atom<string | null>(null);

// Derived atom for active topic filter display
export const activeTopicFilterAtom = atom<string | null>((get) => {
  const filters = get(feedFiltersAtom);
  return filters.topicId ? String(filters.topicId) : null;
});

// Derived atom for active type filter
export const activeTypeFilterAtom = atom<DataType | null>((get) => {
  const filters = get(feedFiltersAtom);
  return filters.type || null;
});

// Derived atom for feed mode
export const feedModeAtom = atom<"personalized" | "browse">((get) => {
  const filters = get(feedFiltersAtom);
  return filters.mode || "personalized";
});

// Action atom to reset feed (used when filters change)
export const resetFeedAtom = atom(null, (get, set) => {
  set(feedItemsAtom, []);
  set(feedCursorAtom, null);
  set(feedHasMoreAtom, true);
  set(feedErrorAtom, null);
});

// Action atom to update filters and reset feed
export const updateFiltersAtom = atom(
  null,
  (get, set, newFilters: Partial<FeedFilters>) => {
    const currentFilters = get(feedFiltersAtom);
    set(feedFiltersAtom, { ...currentFilters, ...newFilters });
    // Reset feed when filters change
    set(resetFeedAtom);
  }
);

// Action atom to toggle feed mode
export const toggleFeedModeAtom = atom(null, (get, set) => {
  const currentFilters = get(feedFiltersAtom);
  const newMode = currentFilters.mode === "personalized" ? "browse" : "personalized";
  set(feedFiltersAtom, { ...currentFilters, mode: newMode });
  set(resetFeedAtom);
});
