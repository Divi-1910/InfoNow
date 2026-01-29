import { motion } from "framer-motion";
import {
  Search,
  Sparkles,
  TrendingUp,
  Bell,
  User,
  Menu,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { useSearchParams } from "react-router-dom";
import { userAtom } from "../store/userAtom";
import { getUserPreferences } from "../api/user";
import UserProfileDropdown from "../components/UserProfileDropdown";
import PreferencesModal from "../components/PreferencesModal";
import { getFeed } from "../api/feed";
import { saveItem, unsaveItem, getSavedIds } from "../api/saved";
import {
  feedItemsAtom,
  feedFiltersAtom,
  feedCursorAtom,
  feedHasMoreAtom,
  feedLoadingAtom,
  feedLoadingMoreAtom,
  feedErrorAtom,
  updateFiltersAtom,
} from "../store/feedAtom";
import { activeTabAtom } from "../store/tabAtom";
import { savedIdsAtom, setSavedIdsAtom, toggleSavedIdAtom } from "../store/savedAtom";
import FeedCard from "../components/FeedCard";
import TrendingContent from "../components/TrendingContent";
import SavedContent from "../components/SavedContent";

const HomePage = () => {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [user] = useAtom(userAtom);
  const [searchParams, setSearchParams] = useSearchParams();
  const [userTopics, setUserTopics] = useState<any[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>("All");

  // Feed state from Jotai atoms
  const [feedItems, setFeedItems] = useAtom(feedItemsAtom);
  const [filters] = useAtom(feedFiltersAtom);
  const [cursor, setCursor] = useAtom(feedCursorAtom);
  const [hasMore, setHasMore] = useAtom(feedHasMoreAtom);
  const [loading, setLoading] = useAtom(feedLoadingAtom);
  const [loadingMore, setLoadingMore] = useAtom(feedLoadingMoreAtom);
  const [error, setError] = useAtom(feedErrorAtom);
  const [, updateFilters] = useAtom(updateFiltersAtom);

  // Saved state
  const [savedIds] = useAtom(savedIdsAtom);
  const [, setSavedIds] = useAtom(setSavedIdsAtom);
  const [, toggleSavedId] = useAtom(toggleSavedIdAtom);

  // Load saved IDs on mount (for authenticated users)
  useEffect(() => {
    if (user) {
      getSavedIds()
        .then((ids) => setSavedIds(ids))
        .catch(() => {});
    }
  }, [user, setSavedIds]);

  // Fetch feed items
  const fetchFeed = useCallback(
    async (isLoadMore = false) => {
      if (isLoadMore) {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
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
        setError(err instanceof Error ? err.message : "Failed to fetch feed");
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
    ]
  );

  // Initial fetch and refetch when filters change
  useEffect(() => {
    if (activeTab === "feed") {
      fetchFeed(false);
    }
  }, [filters, activeTab]);

  useEffect(() => {
    if (searchParams.get("modal") === "preferences") {
      setIsPreferencesOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    getUserPreferences().then((data) => {
      setUserTopics(data.topics);
    });
  }, []);

  const handleClosePreferences = () => {
    setIsPreferencesOpen(false);
    searchParams.delete("modal");
    setSearchParams(searchParams);
  };

  // Handle topic filter change
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

  // Handle save/unsave
  const handleToggleSave = async (itemId: string) => {
    if (!user) {
      // Could show login modal here
      return;
    }

    const isSaved = savedIds.has(itemId);
    try {
      if (isSaved) {
        await unsaveItem(itemId);
      } else {
        await saveItem(itemId);
      }
      toggleSavedId({ id: itemId, saved: !isSaved });
    } catch (err) {
      console.error("Failed to toggle save:", err);
    }
  };

  const topics = ["All", ...userTopics.map((t) => t.name)];

  // Render content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "trending":
        return <TrendingContent />;
      case "saved":
        return <SavedContent />;
      case "feed":
      default:
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

            {/* Feed Items */}
            <div className="space-y-6">
              {/* Loading State */}
              {loading && feedItems.length === 0 && (
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
              {!loading && !error && feedItems.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p className="font-light">No items found</p>
                  <p className="text-sm mt-2">
                    Try adjusting your filters or subscribe to more topics
                  </p>
                </div>
              )}

              {/* Feed Items List */}
              {feedItems.map((item, idx) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  index={idx}
                  isSaved={savedIds.has(item.id)}
                  onToggleSave={handleToggleSave}
                />
              ))}

              {/* Load More Button */}
              {hasMore && feedItems.length > 0 && (
                <div className="flex justify-center pt-4">
                  <motion.button
                    type="button"
                    onClick={() => fetchFeed(true)}
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
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-light tracking-tight">InfoNow</h1>
            <nav className="hidden md:flex gap-6">
              <button
                type="button"
                onClick={() => setActiveTab("feed")}
                className={`text-sm font-light transition-colors ${
                  activeTab === "feed"
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Feed
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("trending")}
                className={`text-sm font-light transition-colors ${
                  activeTab === "trending"
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Trending
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("saved")}
                className={`text-sm font-light transition-colors ${
                  activeTab === "saved"
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Saved
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900/50 rounded-full px-4 py-2 border border-zinc-800/50">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search or ask AI..."
                className="bg-transparent border-none outline-none text-sm font-light w-64 placeholder:text-gray-600"
              />
            </div>
            <button
              type="button"
              title="bell"
              className="p-2 hover:bg-zinc-900/50 rounded-full transition-colors"
            >
              <Bell className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                type="button"
                title="user"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="p-2 hover:bg-zinc-900/50 rounded-full transition-colors"
              >
                {user?.pictureUrl ? (
                  <img
                    src={user.pictureUrl}
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </button>
              <UserProfileDropdown
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
              />
            </div>
            <button
              type="button"
              title="menu"
              className="md:hidden p-2 hover:bg-zinc-900/50 rounded-full transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Tab Content */}
          <div>{renderTabContent()}</div>

          {/* Sidebar */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="hidden lg:block space-y-6"
          >
            {/* AI Assistant Card */}
            <div className="bg-gradient-to-br from-zinc-900/50 to-zinc-950/50 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-light">AI Assistant</h3>
              </div>
              <p className="text-sm text-gray-400 font-light mb-4">
                Ask anything about today's news and trends
              </p>
              <button
                type="button"
                className="w-full bg-white text-black py-2 rounded-full text-sm font-light hover:bg-gray-100 transition-colors"
              >
                Start Conversation
              </button>
            </div>

            {/* Trending Topics */}
            <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" />
                <h3 className="font-light">Trending Now</h3>
              </div>
              <div className="space-y-3">
                {[
                  "OpenAI GPT-5 Launch",
                  "Bitcoin $100K",
                  "NASA Artemis Update",
                  "AI Regulation EU",
                ].map((trend, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600 text-xs font-light">
                      {idx + 1}
                    </span>
                    <span className="text-gray-300 hover:text-white cursor-pointer transition-colors font-light">
                      {trend}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-light mb-1">247</div>
                  <div className="text-xs text-gray-600 font-light">
                    Stories Today
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-light mb-1">{savedIds.size}</div>
                  <div className="text-xs text-gray-600 font-light">
                    Saved Items
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>

      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={handleClosePreferences}
      />
    </div>
  );
};

export default HomePage;
