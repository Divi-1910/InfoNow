/**
 * Format large numbers into compact form (e.g., 1.2K, 3.4M)
 */
export const formatCompactNumber = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};

/**
 * Parse an ISO 8601 duration string (e.g., "PT1H23M45S") into a
 * human-readable format (e.g., "1:23:45" or "23:45").
 *
 * YouTube API returns durations in this format.
 */
export const formatDuration = (iso8601: string): string => {
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) return "0:00";

  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};
