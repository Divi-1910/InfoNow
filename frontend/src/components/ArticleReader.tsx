import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { motion } from "framer-motion";
import {
  Loader2,
  ExternalLink,
  Bookmark,
  AlertCircle,
  Eye,
  ThumbsUp,
  Clock,
  MessageSquare,
  ArrowUp,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { readerItemIdAtom } from "@/store/readerAtom";
import {
  getFeedItem,
  isNewsContent,
  isRedditContent,
  isYoutubeContent,
} from "@/api/feed";
import type { FeedItem } from "@/api/feed";
import { useToggleSave } from "@/hooks/useToggleSave";
import { formatDuration, formatCompactNumber } from "@/lib/format";

export const ArticleReader = () => {
  const [itemId, setItemId] = useAtom(readerItemIdAtom);
  const [item, setItem] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toggleSave, savedIds } = useToggleSave();

  useEffect(() => {
    if (!itemId) {
      setItem(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getFeedItem(itemId)
      .then((data) => {
        if (!cancelled) setItem(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const handleClose = () => setItemId(null);

  const getExternalUrl = (item: FeedItem): string => {
    const c = item.content;
    if (isNewsContent(c)) return c.url;
    if (isRedditContent(c)) return `https://reddit.com${c.permalink}`;
    if (isYoutubeContent(c))
      return `https://youtube.com/watch?v=${c.videoId}`;
    return "#";
  };

  const isSaved = itemId ? savedIds.has(itemId) : false;

  return (
    <Modal
      isOpen={!!itemId}
      onClose={handleClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {item && !loading && (
        <div>
          {/* Header */}
          <div className="p-6 border-b border-zinc-800/50">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs px-2 py-1 bg-zinc-800/50 rounded-full text-gray-400 font-light">
                {item.topic?.name || item.type}
              </span>
              <span className="text-xs px-2 py-1 bg-zinc-800/30 rounded-full text-gray-500 font-light">
                {item.type}
              </span>
            </div>

            <h1 className="text-2xl font-light text-white mb-4 leading-relaxed">
              {isNewsContent(item.content)
                ? item.content.title
                : isRedditContent(item.content)
                  ? item.content.title
                  : isYoutubeContent(item.content)
                    ? item.content.title
                    : ""}
            </h1>

            {/* Meta row */}
            <div className="flex items-center gap-4 flex-wrap">
              {isNewsContent(item.content) && (
                <span className="text-sm text-gray-500 font-light">
                  {item.content.sourceName}
                  {item.content.author && ` · ${item.content.author}`}
                </span>
              )}
              {isRedditContent(item.content) && (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>r/{item.content.subreddit}</span>
                  <span>u/{item.content.author}</span>
                  <span className="flex items-center gap-1">
                    <ArrowUp className="w-3.5 h-3.5" />
                    {formatCompactNumber(item.content.score)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {formatCompactNumber(item.content.numComments)}
                  </span>
                </div>
              )}
              {isYoutubeContent(item.content) && (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{item.content.channelTitle}</span>
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

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => toggleSave(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-light transition-colors ${
                    isSaved
                      ? "text-yellow-400 bg-yellow-400/10"
                      : "text-gray-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <Bookmark
                    className={`w-4 h-4 ${isSaved ? "fill-current" : ""}`}
                  />
                  {isSaved ? "Saved" : "Save"}
                </button>
                <a
                  href={getExternalUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-light text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Original
                </a>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* YouTube embed */}
            {isYoutubeContent(item.content) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-6 rounded-xl overflow-hidden aspect-video"
              >
                <iframe
                  src={`https://www.youtube.com/embed/${item.content.videoId}`}
                  title={item.content.title}
                  className="w-full h-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </motion.div>
            )}

            {/* News image */}
            {isNewsContent(item.content) && item.content.imageUrl && (
              <motion.img
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                src={item.content.imageUrl}
                alt={item.content.title}
                className="w-full max-h-80 object-cover rounded-xl mb-6"
              />
            )}

            {/* Summary */}
            {item.enriched?.summary && (
              <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800/30 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-gray-600 mb-2">
                  Summary
                </p>
                <p className="text-sm text-gray-300 font-light leading-relaxed">
                  {item.enriched.summary}
                </p>
              </div>
            )}

            {/* Full content */}
            {item.enriched?.fullContent && (
              <div className="prose prose-invert prose-sm max-w-none">
                {item.enriched.fullContent.split("\n").map((p, i) =>
                  p.trim() ? (
                    <p
                      key={i}
                      className="text-gray-300 font-light leading-relaxed mb-4"
                    >
                      {p}
                    </p>
                  ) : null
                )}
              </div>
            )}

            {/* Reddit selftext */}
            {isRedditContent(item.content) &&
              item.content.selftext &&
              !item.enriched?.fullContent && (
                <div className="prose prose-invert prose-sm max-w-none">
                  {item.content.selftext.split("\n").map((p, i) =>
                    p.trim() ? (
                      <p
                        key={i}
                        className="text-gray-300 font-light leading-relaxed mb-4"
                      >
                        {p}
                      </p>
                    ) : null
                  )}
                </div>
              )}

            {/* No content fallback */}
            {!item.enriched?.fullContent &&
              !(
                isRedditContent(item.content) && item.content.selftext
              ) &&
              !isYoutubeContent(item.content) && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm font-light mb-3">
                    Full content not available
                  </p>
                  <a
                    href={getExternalUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Read on original site
                  </a>
                </div>
              )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ArticleReader;
