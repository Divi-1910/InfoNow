import { useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { motion } from "framer-motion";
import { AlertCircle, TrendingUp } from "lucide-react";
import {
  trendingItemsAtom,
  trendingFiltersAtom,
  trendingLoadingAtom,
  trendingErrorAtom,
  setTimeRangeAtom,
} from "../store/trendingAtom";
import { getTrending, type TimeRange } from "../api/trending";
import FeedCard from "./FeedCard";
import FeedCardSkeleton from "./FeedCardSkeleton";
import { useToggleSave } from "@/hooks/useToggleSave";

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

export const TrendingContent = () => {
  const [items, setItems] = useAtom(trendingItemsAtom);
  const [filters] = useAtom(trendingFiltersAtom);
  const [loading, setLoading] = useAtom(trendingLoadingAtom);
  const [error, setError] = useAtom(trendingErrorAtom);
  const [, setTimeRange] = useAtom(setTimeRangeAtom);
  const { toggleSave, savedIds } = useToggleSave();

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getTrending({
        timeRange: filters.timeRange,
        topicId: filters.topicId,
        subTopicId: filters.subTopicId,
        type: filters.type,
        limit: 20,
      });
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch trending");
    } finally {
      setLoading(false);
    }
  }, [filters, setItems, setLoading, setError]);

  useEffect(() => {
    fetchTrending();
  }, [filters]);

  return (
    <div>
      {/* Time Range Selector */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-4 mb-8"
      >
        <div className="flex items-center gap-2 text-gray-400">
          <TrendingUp className="w-5 h-5" />
          <span className="text-sm font-light">Trending in</span>
        </div>
        <div className="flex gap-2">
          {timeRangeOptions.map((option) => (
            <motion.button
              key={option.value}
              type="button"
              onClick={() => setTimeRange(option.value)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-full text-sm font-light transition-all ${
                filters.timeRange === option.value
                  ? "bg-white text-black hover:bg-gray-100"
                  : "bg-zinc-900/50 text-gray-400 hover:bg-zinc-800/50 hover:text-white border border-zinc-800/50"
              }`}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Content */}
      <div className="space-y-6">
        {loading && items.length === 0 && (
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

        {!loading && !error && items.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="font-light">No trending content found</p>
            <p className="text-sm mt-2">Try a different time range</p>
          </div>
        )}

        {items.map((item, idx) => (
          <FeedCard
            key={item.id}
            item={item}
            index={idx}
            isSaved={savedIds.has(item.id)}
            onToggleSave={toggleSave}
          />
        ))}
      </div>
    </div>
  );
};

export default TrendingContent;
