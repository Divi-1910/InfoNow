import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp } from "lucide-react";
import { useAtom } from "jotai";
import { getTrending } from "@/api/trending";
import { feedItemsAtom } from "@/store/feedAtom";
import { useToggleSave } from "@/hooks/useToggleSave";
import type { FeedItem } from "@/api/feed";

export const Sidebar = () => {
  const [sidebarTrending, setSidebarTrending] = useState<FeedItem[]>([]);
  const [feedItems] = useAtom(feedItemsAtom);
  const { savedIds } = useToggleSave();

  useEffect(() => {
    getTrending({ timeRange: "24h", limit: 4 })
      .then((res) => setSidebarTrending(res.items))
      .catch(() => {});
  }, []);

  return (
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
          {sidebarTrending.length > 0 ? (
            sidebarTrending.map((item, idx) => {
              const title =
                "title" in item.content
                  ? (item.content as { title: string }).title
                  : "";
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="text-gray-600 text-xs font-light mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="text-gray-300 hover:text-white cursor-pointer transition-colors font-light line-clamp-2">
                    {title}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-xs text-gray-600 font-light">
              Loading trends...
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-light mb-1">{feedItems.length}</div>
            <div className="text-xs text-gray-600 font-light">In Feed</div>
          </div>
          <div>
            <div className="text-2xl font-light mb-1">{savedIds.size}</div>
            <div className="text-xs text-gray-600 font-light">Saved Items</div>
          </div>
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
