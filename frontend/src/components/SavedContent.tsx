import { useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, Bookmark, LogIn } from "lucide-react";
import {
  savedItemsAtom,
  savedCursorAtom,
  savedHasMoreAtom,
  savedLoadingAtom,
  savedLoadingMoreAtom,
  savedErrorAtom,
  savedIdsAtom,
  toggleSavedIdAtom,
} from "../store/savedAtom";
import { getSavedItems, unsaveItem } from "../api/saved";
import { userAtom } from "../store/userAtom";
import FeedCard from "./FeedCard";

export const SavedContent = () => {
  const [items, setItems] = useAtom(savedItemsAtom);
  const [cursor, setCursor] = useAtom(savedCursorAtom);
  const [hasMore, setHasMore] = useAtom(savedHasMoreAtom);
  const [loading, setLoading] = useAtom(savedLoadingAtom);
  const [loadingMore, setLoadingMore] = useAtom(savedLoadingMoreAtom);
  const [error, setError] = useAtom(savedErrorAtom);
  const [savedIds] = useAtom(savedIdsAtom);
  const [, toggleSavedId] = useAtom(toggleSavedIdAtom);
  const [user] = useAtom(userAtom);

  // Fetch saved items
  const fetchSaved = useCallback(
    async (isLoadMore = false) => {
      if (isLoadMore) {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const response = await getSavedItems({
          cursor: isLoadMore ? (cursor ?? undefined) : undefined,
          limit: 20,
        });

        if (isLoadMore) {
          setItems((prev) => [...prev, ...response.items]);
        } else {
          setItems(response.items);
        }

        setCursor(response.pagination.nextCursor);
        setHasMore(response.pagination.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch saved items");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, hasMore, loadingMore, setItems, setCursor, setHasMore, setLoading, setLoadingMore, setError]
  );

  // Fetch on mount
  useEffect(() => {
    if (user) {
      fetchSaved(false);
    }
  }, [user]);

  // Handle unsave (remove from saved list)
  const handleToggleSave = async (itemId: string) => {
    try {
      await unsaveItem(itemId);
      toggleSavedId({ id: itemId, saved: false });
      // Remove from current list
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      console.error("Failed to unsave:", err);
    }
  };

  // Not logged in state
  if (!user) {
    return (
      <div className="text-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="p-4 bg-zinc-900/50 rounded-full">
            <LogIn className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-light text-gray-300">Sign in to see your saved articles</h3>
          <p className="text-sm text-gray-500 font-light max-w-md">
            Save articles from your feed to read later. Your saved items will be synced across devices.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 text-gray-400 mb-8"
      >
        <Bookmark className="w-5 h-5" />
        <span className="text-sm font-light">Your saved articles</span>
        {items.length > 0 && (
          <span className="text-xs text-gray-600">({items.length} items)</span>
        )}
      </motion.div>

      {/* Content */}
      <div className="space-y-6">
        {/* Loading State */}
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-center justify-center py-12 text-red-400">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="p-4 bg-zinc-900/30 rounded-full">
                <Bookmark className="w-8 h-8 text-gray-600" />
              </div>
              <p className="font-light">No saved articles yet</p>
              <p className="text-sm">
                Click the bookmark icon on any article to save it for later
              </p>
            </motion.div>
          </div>
        )}

        {/* Saved Items */}
        {items.map((item, idx) => (
          <FeedCard
            key={item.id}
            item={item}
            index={idx}
            isSaved={true}
            onToggleSave={handleToggleSave}
            showSavedAt={true}
          />
        ))}

        {/* Load More Button */}
        {hasMore && items.length > 0 && (
          <div className="flex justify-center pt-4">
            <motion.button
              type="button"
              onClick={() => fetchSaved(true)}
              disabled={loadingMore}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-6 py-3 bg-zinc-900/50 border border-zinc-800/50 rounded-full text-sm font-light text-gray-400 hover:text-white hover:border-zinc-700/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedContent;
