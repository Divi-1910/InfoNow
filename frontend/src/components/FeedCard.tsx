import { motion } from "framer-motion";
import { Bookmark, Eye, ThumbsUp, Clock, BookOpen } from "lucide-react";
import { useSetAtom } from "jotai";
import type { FeedItem } from "../api/feed";
import { isNewsContent, isRedditContent, isYoutubeContent } from "../api/feed";
import { readerItemIdAtom } from "@/store/readerAtom";
import { formatCompactNumber, formatDuration } from "@/lib/format";

interface FeedCardProps {
  item: FeedItem;
  index: number;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  showSavedAt?: boolean;
}

// Helper to get item display info
const getItemInfo = (item: FeedItem) => {
  const content = item.content;
  if (isNewsContent(content)) {
    return {
      title: content.title,
      source: content.sourceName || "News",
      image: content.imageUrl,
      url: content.url,
      time: formatRelativeTime(content.publishedAt),
    };
  } else if (isRedditContent(content)) {
    return {
      title: content.title,
      source: `r/${content.subreddit}`,
      image: content.thumbnail !== "self" ? content.thumbnail : null,
      url: `https://reddit.com${content.permalink}`,
      time: formatRelativeTime(content.createdUtc),
    };
  } else if (isYoutubeContent(content)) {
    return {
      title: content.title,
      source: content.channelTitle,
      image: content.thumbnailUrl,
      url: `https://youtube.com/watch?v=${content.videoId}`,
      time: formatRelativeTime(content.publishedAt),
    };
  }
  return { title: "", source: "", image: null, url: "#", time: "" };
};

// Format relative time (e.g., "2 min ago", "1h ago")
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const FeedCard = ({
  item,
  index,
  isSaved,
  onToggleSave,
  showSavedAt = false,
}: FeedCardProps) => {
  const info = getItemInfo(item);
  const setReaderItemId = useSetAtom(readerItemIdAtom);

  const handleClick = () => {
    if (item.enriched?.hasFullContent || isYoutubeContent(item.content)) {
      setReaderItemId(item.id);
    } else {
      window.open(info.url, "_blank");
    }
  };

  return (
    <motion.article
      key={item.id}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(0.2 + index * 0.05, 0.5) }}
      whileHover={{ y: -4 }}
      className="group bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700/50 hover:bg-zinc-900/40 transition-all cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex flex-col md:flex-row">
        <div className="md:w-72 h-48 md:h-auto overflow-hidden bg-zinc-900/50 relative">
          {info.image ? (
            <motion.img
              src={info.image}
              alt={info.title}
              className="w-full h-full object-cover"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.6 }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600">
              <span className="text-4xl font-light">
                {item.type === "News"
                  ? "📰"
                  : item.type === "Reddit"
                    ? "💬"
                    : "🎬"}
              </span>
            </div>
          )}
          {/* YouTube duration overlay */}
          {isYoutubeContent(item.content) && item.content.duration && (
            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-xs text-white font-medium">
              {formatDuration(item.content.duration)}
            </span>
          )}
        </div>
        <div className="flex-1 p-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs px-2 py-1 bg-zinc-800/50 rounded-full text-gray-400 font-light">
              {item.topic?.name || item.type}
            </span>
            <span className="text-xs px-2 py-1 bg-zinc-800/30 rounded-full text-gray-500 font-light">
              {item.type}
            </span>
            {item.enriched?.hasFullContent && (
              <span className="text-xs px-2 py-1 bg-emerald-900/30 border border-emerald-800/30 rounded-full text-emerald-400 font-light flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                Full article
              </span>
            )}
            <span className="text-xs text-gray-600 font-light">{info.source}</span>
            <span className="text-xs text-gray-700">&middot;</span>
            <span className="text-xs text-gray-600 font-light">{info.time}</span>
            {showSavedAt && item.savedAt && (
              <>
                <span className="text-xs text-gray-700">&middot;</span>
                <span className="text-xs text-gray-600 font-light">
                  Saved {formatRelativeTime(item.savedAt)}
                </span>
              </>
            )}
          </div>
          <h3 className="text-xl font-light mb-3 group-hover:text-gray-300 transition-colors line-clamp-2">
            {info.title}
          </h3>
          {/* Show summary if available */}
          {item.enriched?.summary && (
            <p className="text-sm text-gray-500 font-light mb-4 line-clamp-2">
              {item.enriched.summary}
            </p>
          )}
          {/* YouTube metadata row */}
          {isYoutubeContent(item.content) && (
            <div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {formatCompactNumber(item.content.viewCount)}
              </span>
              <span className="flex items-center gap-1">
                <ThumbsUp className="w-3.5 h-3.5" />
                {formatCompactNumber(item.content.likeCount)}
              </span>
              {item.content.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(item.content.duration)}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={`text-sm transition-colors flex items-center gap-1 font-light ${
                isSaved
                  ? "text-yellow-400 hover:text-yellow-300"
                  : "text-gray-500 hover:text-white"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave(item.id);
              }}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? "fill-current" : ""}`} />
              {isSaved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
};

export default FeedCard;
