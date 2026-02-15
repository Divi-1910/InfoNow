import { useRef, useEffect } from "react";

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  rootMargin?: string;
}

export const useInfiniteScroll = (options: UseInfiniteScrollOptions) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { onLoadMore, hasMore, loading, rootMargin } = options;

  useEffect(() => {
    if (!hasMore || loading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore, rootMargin]);

  return sentinelRef;
};
