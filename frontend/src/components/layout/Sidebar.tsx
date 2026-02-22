import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, ArrowUpRight } from "lucide-react";
import { useAtom } from "jotai";
import { getTrending } from "@/api/trending";
import { feedItemsAtom } from "@/store/feedAtom";
import { useToggleSave } from "@/hooks/useToggleSave";
import type { TrendingTopic } from "@/api/trending";

interface SidebarProps {
  onOpenAssistant: () => void;
}

export const Sidebar = ({ onOpenAssistant }: SidebarProps) => {
  const [sidebarTrendingTopics, setSidebarTrendingTopics] = useState<
    TrendingTopic[]
  >([]);
  const [feedItems] = useAtom(feedItemsAtom);
  const { savedIds } = useToggleSave();

  useEffect(() => {
    getTrending({ timeRange: "24h", limit: 12, topicLimit: 5 })
      .then((res) => setSidebarTrendingTopics(res.trendingTopics ?? []))
      .catch(() => {});
  }, []);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="hidden lg:flex flex-col gap-4"
    >
      {/* Infiya AI Card */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.08),transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-3">
            <div>
              <p className="text-[13px] font-semibold text-white leading-none">
                Infiya
              </p>
              <p className="text-[11px] text-zinc-500 leading-none mt-0.5">
                AI Research Assistant
              </p>
            </div>
          </div>
          <p className="text-[13px] text-zinc-400 leading-relaxed mb-4">
            Ask anything about today's news, trends, and events.
          </p>
          <button
            type="button"
            onClick={onOpenAssistant}
            className="w-full flex items-center justify-center gap-1.5 bg-white text-black text-[13px] font-medium py-2 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            Start Conversation
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Trending Topics */}
      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-zinc-400" />
          <h3 className="text-[13px] font-semibold text-zinc-300">
            Trending Now
          </h3>
          <span className="ml-auto text-[10px] text-zinc-600 font-medium uppercase tracking-wide">
            24h
          </span>
        </div>
        <div className="space-y-0">
          {sidebarTrendingTopics.length > 0 ? (
            sidebarTrendingTopics.map((topic, idx) => (
              <div
                key={topic.id}
                className="flex items-center gap-3 py-2.5 border-b border-zinc-800/40 last:border-0"
              >
                <span className="text-[11px] font-medium text-zinc-600 w-4 shrink-0 text-right">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-zinc-300 hover:text-white transition-colors font-medium line-clamp-1">
                    {topic.name}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    {topic.count} signals
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2 border-b border-zinc-800/40 last:border-0"
                >
                  <div className="w-4 h-3 bg-zinc-800/60 rounded animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-zinc-800/60 rounded animate-pulse w-3/4" />
                    <div className="h-2.5 bg-zinc-800/40 rounded animate-pulse w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <p className="text-2xl font-light text-white tabular-nums">
              {feedItems.length}
            </p>
            <p className="text-[11px] text-zinc-600 mt-0.5">In Feed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-light text-white tabular-nums">
              {savedIds.size}
            </p>
            <p className="text-[11px] text-zinc-600 mt-0.5">Saved</p>
          </div>
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
