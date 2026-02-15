import { Skeleton } from "@/components/ui/Skeleton";

export const FeedCardSkeleton = () => {
  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-72 h-48 md:h-auto">
          <Skeleton className="w-full h-full min-h-[180px]" variant="rectangular" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" variant="text" />
            <Skeleton className="h-5 w-14" variant="text" />
            <Skeleton className="h-4 w-24" variant="text" />
          </div>
          <Skeleton className="h-6 w-3/4" variant="text" />
          <Skeleton className="h-6 w-1/2" variant="text" />
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-2/3" variant="text" />
          </div>
          <Skeleton className="h-5 w-16 mt-2" variant="text" />
        </div>
      </div>
    </div>
  );
};

export default FeedCardSkeleton;
