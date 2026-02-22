import { atom } from "jotai";
import type { FeedItem, FeedFilters } from "../api/feed";

// Set of saved item IDs for quick O(1) lookup
export const savedIdsAtom = atom<Set<string>>(new Set<string>());

// Saved items feed state (mirrors feed atom structure)
export const savedItemsAtom = atom<FeedItem[]>([]);
export const savedFiltersAtom = atom<Omit<FeedFilters, "mode">>({});
export const savedCursorAtom = atom<string | null>(null);
export const savedHasMoreAtom = atom<boolean>(true);
export const savedLoadingAtom = atom<boolean>(false);
export const savedLoadingMoreAtom = atom<boolean>(false);
export const savedErrorAtom = atom<string | null>(null);

// Action to add/remove from savedIds set
export const toggleSavedIdAtom = atom(
  null,
  (get, set, { id, saved }: { id: string; saved: boolean }) => {
    const currentIds = get(savedIdsAtom);
    const newIds = new Set(currentIds);
    if (saved) {
      newIds.add(id);
    } else {
      newIds.delete(id);
    }
    set(savedIdsAtom, newIds);
  }
);

// Action to set all saved IDs (bulk load on mount)
export const setSavedIdsAtom = atom(null, (_get, set, ids: string[]) => {
  set(savedIdsAtom, new Set(ids));
});

// Derived atom to check if a specific item is saved
export const isItemSavedAtom = atom((get) => {
  const savedIds = get(savedIdsAtom);
  return (id: string) => savedIds.has(id);
});

// Action atom to reset saved feed
export const resetSavedFeedAtom = atom(null, (_get, set) => {
  set(savedItemsAtom, []);
  set(savedCursorAtom, null);
  set(savedHasMoreAtom, true);
  set(savedErrorAtom, null);
});

// Action atom to update saved filters and reset feed
export const updateSavedFiltersAtom = atom(
  null,
  (get, set, newFilters: Partial<Omit<FeedFilters, "mode">>) => {
    const currentFilters = get(savedFiltersAtom);
    set(savedFiltersAtom, { ...currentFilters, ...newFilters });
    set(resetSavedFeedAtom);
  }
);
