import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useAtom } from "jotai";
import { getFeed } from "@/api/feed";
import {
  feedItemsAtom,
  feedFiltersAtom,
  feedCursorAtom,
  feedHasMoreAtom,
  feedLoadingAtom,
  feedLoadingMoreAtom,
  feedErrorAtom,
  updateFiltersAtom,
} from "@/store/feedAtom";
import { activeTabAtom } from "@/store/tabAtom";
import FeedCard from "@/components/FeedCard";
import FeedCardSkeleton from "@/components/FeedCardSkeleton";
import { useToggleSave } from "@/hooks/useToggleSave";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { getApiErrorMessage } from "@/lib/errors";

export const FeedContent = () => {
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [feedItems, setFeedItems] = useAtom(feedItemsAtom);
  const [filters] = useAtom(feedFiltersAtom);
  const [cursor, setCursor] = useAtom(feedCursorAtom);
  const [hasMore, setHasMore] = useAtom(feedHasMoreAtom);
  const [loading, setLoading] = useAtom(feedLoadingAtom);
  const [loadingMore, setLoadingMore] = useAtom(feedLoadingMoreAtom);
  const [error, setError] = useAtom(feedErrorAtom);
  const [, updateFilters] = useAtom(updateFiltersAtom);
  const [activeTab] = useAtom(activeTabAtom);

  const { toggleSave, savedIds } = useToggleSave();

  const fetchFeed = useCallback(
    async (isLoadMore = false) => {
      if (isLoadMore) {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        setLoadMoreError(null);
      } else {
        setLoading(true);
        setError(null);
        setLoadMoreError(null);
      }

      try {
        const response = await getFeed({
          ...filters,
          cursor: isLoadMore ? (cursor ?? undefined) : undefined,
          limit: 20,
        });

        if (isLoadMore) {
          // Deduplicate by id in case the backend returns overlapping pages.
          setFeedItems((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const next = [...prev];
            for (const item of response.items) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                next.push(item);
              }
            }
            return next;
          });
        } else {
          setFeedItems(response.items);
        }

        setCursor(response.pagination.nextCursor);
        setHasMore(response.pagination.hasMore);
      } catch (err) {
        const message = getApiErrorMessage(err, "Failed to fetch feed");
        if (isLoadMore) {
          setLoadMoreError(message);
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      filters,
      cursor,
      hasMore,
      loadingMore,
      setFeedItems,
      setCursor,
      setHasMore,
      setLoading,
      setLoadingMore,
      setError,
    ],
  );

  useEffect(() => {
    if (activeTab === "feed") {
      fetchFeed(false);
    }
  }, [filters, activeTab]);

  const feedSentinelRef = useInfiniteScroll({
    onLoadMore: () => fetchFeed(true),
    hasMore: hasMore && !loadMoreError,
    loading: loadingMore,
    rootMargin: "200px",
  });

  return (
    <div>
      <div className="space-y-6">
        {loading && feedItems.length === 0 && (
          <div className="space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <FeedCardSkeleton key={i} />
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 text-red-400 gap-3">
            <div className="flex items-center justify-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="text-sm">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchFeed(false)}
              className="px-3 py-1.5 rounded-full text-xs font-light bg-zinc-800/60 border border-zinc-700 hover:bg-zinc-700 text-gray-200 transition-colors"
            >
              Retry feed
            </button>
          </div>
        )}

        {!loading && !error && feedItems.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="font-light">No items found</p>
            <p className="text-sm mt-2">
              Try adjusting your filters or subscribe to more topics
            </p>
          </div>
        )}

        {feedItems.map((item, idx) => (
          <FeedCard
            key={item.id}
            item={item}
            index={idx}
            isSaved={savedIds.has(item.id)}
            onToggleSave={toggleSave}
          />
        ))}

        <div ref={feedSentinelRef} />
        {loadMoreError && (
          <div className="flex flex-col items-center justify-center py-4 text-red-400 gap-3">
            <div className="flex items-center justify-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="text-sm">{loadMoreError}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchFeed(true)}
              className="px-3 py-1.5 rounded-full text-xs font-light bg-zinc-800/60 border border-zinc-700 hover:bg-zinc-700 text-gray-200 transition-colors"
            >
              Retry loading more
            </button>
          </div>
        )}
        {loadingMore && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedContent;
