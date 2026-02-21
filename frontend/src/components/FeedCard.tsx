import { motion } from "framer-motion";
import { Bookmark, Eye, ThumbsUp, Clock, BookOpen, MessageSquare, ArrowUpRight } from "lucide-react";
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
  return { title: "Unknown", source: "", image: null, url: "#", time: "" };
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const typeConfig = {
  News: { color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20", label: "News" },
  Reddit: { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "Reddit" },
  Youtube: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", label: "YouTube" },
};

const typeFallbackBg = {
  News: "bg-sky-950/40",
  Reddit: "bg-orange-950/40",
  Youtube: "bg-red-950/40",
};

const typeFallbackIcon = {
  News: "📰",
  Reddit: "💬",
  Youtube: "🎬",
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
  const typeStyle = typeConfig[item.type] ?? typeConfig.News;

  const handleClick = () => {
    const hasSummary = Boolean(item.enriched?.summary);
    if (hasSummary || item.enriched?.hasFullContent || isYoutubeContent(item.content)) {
      setReaderItemId(item.id);
    } else {
      window.open(info.url, "_blank");
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(0.1 + index * 0.04, 0.4), duration: 0.35 }}
      whileHover={{ y: -3 }}
      className="group bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700/60 hover:bg-zinc-900/50 transition-all cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Thumbnail */}
        <div className={`sm:w-64 md:w-72 h-44 sm:h-auto overflow-hidden relative shrink-0 ${!info.image ? typeFallbackBg[item.type] : ""}`}>
          {info.image ? (
            <img
              src={info.image}
              alt={info.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              onError={(e) => {
                e.currentTarget.parentElement!.className = `sm:w-64 md:w-72 h-44 sm:h-auto overflow-hidden relative shrink-0 ${typeFallbackBg[item.type]}`;
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl opacity-40">{typeFallbackIcon[item.type]}</span>
            </div>
          )}
          {/* YouTube duration */}
          {isYoutubeContent(item.content) && item.content.duration && (
            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/75 rounded-md text-[11px] text-white font-medium backdrop-blur-sm">
              {formatDuration(item.content.duration)}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col gap-3 min-w-0">
          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${typeStyle.bg} ${typeStyle.border} ${typeStyle.color}`}>
              {typeStyle.label}
            </span>
            {item.topic && (
              <span className="text-[11px] px-2 py-0.5 bg-zinc-800/50 rounded-full text-zinc-400 font-medium">
                {item.topic.name}
              </span>
            )}
            {item.enriched?.hasFullContent && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 font-medium">
                <BookOpen className="w-2.5 h-2.5" />
                Full article
              </span>
            )}
            <span className="text-[11px] text-zinc-600 ml-auto">{info.time}</span>
          </div>

          {/* Title */}
          <h3 className="text-[15px] font-medium leading-snug text-zinc-100 group-hover:text-white transition-colors line-clamp-2">
            {info.title}
          </h3>

          {/* Summary */}
          {item.enriched?.summary && (
            <p className="text-[13px] text-zinc-500 leading-relaxed line-clamp-2 -mt-1">
              {item.enriched.summary}
            </p>
          )}

          {/* YouTube stats */}
          {isYoutubeContent(item.content) && (
            <div className="flex items-center gap-3 text-[12px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {formatCompactNumber(item.content.viewCount)}
              </span>
              <span className="flex items-center gap-1">
                <ThumbsUp className="w-3 h-3" />
                {formatCompactNumber(item.content.likeCount)}
              </span>
              {item.content.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(item.content.duration)}
                </span>
              )}
            </div>
          )}

          {/* Reddit stats */}
          {isRedditContent(item.content) && (
            <div className="flex items-center gap-3 text-[12px] text-zinc-500">
              <span className="flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                {formatCompactNumber(item.content.score)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {formatCompactNumber(item.content.numComments)}
              </span>
            </div>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between mt-auto pt-1">
            <span className="text-[12px] text-zinc-600 truncate">{info.source}</span>
            {showSavedAt && item.savedAt && (
              <span className="text-[11px] text-zinc-700 shrink-0 ml-2">
                Saved {formatRelativeTime(item.savedAt)}
              </span>
            )}
            <button
              type="button"
              className={`shrink-0 flex items-center gap-1.5 text-[12px] transition-colors px-2.5 py-1 rounded-lg ml-2 ${
                isSaved
                  ? "text-amber-400 hover:text-amber-300 bg-amber-500/10"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave(item.id);
              }}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? "fill-current" : ""}`} />
              <span className="font-medium">{isSaved ? "Saved" : "Save"}</span>
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
};

export default FeedCard;
