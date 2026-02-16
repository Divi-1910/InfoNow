import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  AlertCircle,
  Newspaper,
  MessageSquare,
  Play,
} from "lucide-react";
import { useAtom } from "jotai";
import type { DataType } from "@/api/feed";
import { getFeed } from "@/api/feed";
import { getUserPreferences } from "@/api/user";
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
import DateRangePicker from "@/components/DateRangePicker";
import { useToggleSave } from "@/hooks/useToggleSave";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { getApiErrorMessage } from "@/lib/errors";

export const FeedContent = () => {
  const [userTopics, setUserTopics] = useState<any[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<DataType | "All">("All");
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

  useEffect(() => {
    getUserPreferences()
      .then((data) => {
        setUserTopics(data.topics);
      })
      .catch(() => {
        setUserTopics([]);
      });
  }, []);

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
          setFeedItems((prev) => [...prev, ...response.items]);
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

  const handleTopicFilter = (topicName: string) => {
    setSelectedTopic(topicName);
    if (topicName === "All") {
      updateFilters({ topicId: undefined });
    } else {
      const topic = userTopics.find((t) => t.name === topicName);
      if (topic) {
        updateFilters({ topicId: topic.id });
      }
    }
  };

  const handleTypeFilter = (type: DataType | "All") => {
    setSelectedType(type);
    updateFilters({ type: type === "All" ? undefined : type });
  };

  const contentTypes: {
    value: DataType | "All";
    label: string;
    icon: React.ReactNode;
  }[] = [
    { value: "All", label: "All", icon: null },
    {
      value: "News",
      label: "News",
      icon: <Newspaper className="w-3.5 h-3.5" />,
    },
    {
      value: "Youtube",
      label: "YouTube",
      icon: <Play className="w-3.5 h-3.5" />,
    },
  ];

  const topics = ["All", ...userTopics.map((t) => t.name)];

  return (
    <div>
      {/* Topics Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide"
      >
        {topics.map((topic) => (
          <motion.button
            key={topic}
            type="button"
            onClick={() => handleTopicFilter(topic)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`px-4 py-2 rounded-full text-sm font-light whitespace-nowrap transition-all ${
              selectedTopic === topic
                ? "bg-white text-black hover:bg-gray-100"
                : "bg-zinc-900/50 text-gray-400 hover:bg-zinc-800/50 hover:text-white border border-zinc-800/50"
            }`}
          >
            {topic}
          </motion.button>
        ))}
      </motion.div>

      {/* Content Type Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex gap-2 mb-6"
      >
        {contentTypes.map((ct) => (
          <motion.button
            key={ct.value}
            type="button"
            onClick={() => handleTypeFilter(ct.value)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-light whitespace-nowrap transition-all ${
              selectedType === ct.value
                ? "bg-white text-black"
                : "bg-zinc-900/50 text-gray-500 hover:text-white border border-zinc-800/50"
            }`}
          >
            {ct.icon}
            {ct.label}
          </motion.button>
        ))}
        <DateRangePicker
          onApply={(dateFrom, dateTo) => updateFilters({ dateFrom, dateTo })}
        />
      </motion.div>

      {/* Feed Items */}
      <div className="space-y-6">
        {loading && feedItems.length === 0 && (
          <div className="space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <FeedCardSkeleton key={i} />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12 text-red-400">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span className="text-sm">{error}</span>
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
