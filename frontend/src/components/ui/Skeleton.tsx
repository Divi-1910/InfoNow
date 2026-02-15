interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string;
  height?: string;
}

const variantStyles: Record<string, string> = {
  text: "rounded",
  circular: "rounded-full",
  rectangular: "rounded-xl",
};

export const Skeleton = ({
  className = "",
  variant = "rectangular",
  width,
  height,
}: SkeletonProps) => {
  return (
    <div
      className={`animate-pulse bg-zinc-800/50 ${variantStyles[variant]} ${className}`}
      style={{ width, height }}
    />
  );
};

export default Skeleton;
