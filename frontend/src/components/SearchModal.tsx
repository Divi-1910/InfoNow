import { useState, useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Newspaper, MessageSquare, Play, Loader2 } from "lucide-react";
import { readerItemIdAtom } from "@/store/readerAtom";
import { isNewsContent, isRedditContent, isYoutubeContent, searchFeed } from "@/api/feed";
import type { FeedItem } from "@/api/feed";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getTitle = (item: FeedItem): string => {
  const c = item.content;
  if (isNewsContent(c)) return c.title;
  if (isRedditContent(c)) return c.title;
  if (isYoutubeContent(c)) return c.title;
  return "";
};

const getSource = (item: FeedItem): string => {
  const c = item.content;
  if (isNewsContent(c)) return c.sourceName || "News";
  if (isRedditContent(c)) return `r/${c.subreddit}`;
  if (isYoutubeContent(c)) return c.channelTitle;
  return "";
};

const getUrl = (item: FeedItem): string => {
  const c = item.content;
  if (isNewsContent(c)) return c.url;
  if (isRedditContent(c)) return `https://reddit.com${c.permalink}`;
  if (isYoutubeContent(c)) return `https://youtube.com/watch?v=${c.videoId}`;
  return "#";
};

const TypeIcon = ({ type }: { type: FeedItem["type"] }) => {
  switch (type) {
    case "News":
      return <Newspaper className="w-3.5 h-3.5 text-blue-400" />;
    case "Reddit":
      return <MessageSquare className="w-3.5 h-3.5 text-orange-400" />;
    case "Youtube":
      return <Play className="w-3.5 h-3.5 text-red-400" />;
    default:
      return null;
  }
};

export const SearchModal = ({ isOpen, onClose }: SearchModalProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, setReaderItemId] = useAtom(readerItemIdAtom);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      abortRef.current?.abort();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setIsLoading(true);
      try {
        const res = await searchFeed({ q: query, limit: 12 }, abortRef.current.signal);
        setResults(res.items);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query]);

  const handleSelect = (item: FeedItem) => {
    const hasSummary = Boolean(item.enriched?.summary);
    if (hasSummary || item.enriched?.hasFullContent || isYoutubeContent(item.content)) {
      setReaderItemId(item.id);
    } else {
      window.open(getUrl(item), "_blank");
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-xl bg-black border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/50">
              <Search className="w-5 h-5 text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles, topics, sources..."
                className="flex-1 bg-transparent border-none outline-none text-sm font-light placeholder:text-gray-600"
              />
              <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] text-gray-600 bg-zinc-900 border border-zinc-800 rounded font-mono">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {isLoading && (
                <div className="px-5 py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                </div>
              )}

              {!isLoading && query.trim() && results.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-500 font-light">
                  No results for "{query}"
                </div>
              )}

              {!isLoading && results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="w-full px-5 py-3 flex items-start gap-3 hover:bg-zinc-900/50 transition-colors text-left"
                >
                  <div className="mt-0.5 shrink-0">
                    <TypeIcon type={item.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-light text-gray-200 line-clamp-1">
                      {getTitle(item)}
                    </p>
                    <p className="text-xs text-gray-600 font-light mt-0.5">
                      {getSource(item)}
                      {item.topic?.name && ` · ${item.topic.name}`}
                    </p>
                  </div>
                </button>
              ))}

              {!isLoading && !query.trim() && (
                <div className="px-5 py-8 text-center text-sm text-gray-600 font-light">
                  Type to search articles and videos
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SearchModal;
