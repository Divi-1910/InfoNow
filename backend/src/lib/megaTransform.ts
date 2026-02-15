/**
 * Transforms an OpenSearch mega_index hit into the FeedItem API response shape.
 * Handles source_type casing: OS stores lowercase ("news"/"youtube"),
 * API returns title-case ("News"/"Youtube").
 */

export function hitToFeedItem(hit: any, savedIds: Set<string>) {
  const src = hit._source;
  const dataPointId: string = src.data_point_id ?? hit._id;

  // Map lowercase source_type to API enum casing
  const type = src.source_type === "news"
    ? "News"
    : src.source_type === "youtube"
    ? "Youtube"
    : (src.source_type as string);

  // Build topic/subTopic info if present
  const topic =
    src.topic_id != null
      ? { id: src.topic_id, name: src.topic_name ?? "", slug: src.topic_slug ?? "" }
      : null;

  const subTopic =
    src.subtopic_id != null
      ? { id: src.subtopic_id, name: src.subtopic_name ?? "", slug: src.subtopic_slug ?? "" }
      : null;

  // Build type-specific content
  let content: any;
  if (type === "News") {
    content = {
      title: src.title,
      url: src.url ?? null,
      description: src.description ?? null,
      publishedAt: src.published_at,
      sourceName: src.source_name ?? null,
      author: src.author ?? null,
      imageUrl: src.image_url ?? null,
    };
  } else if (type === "Youtube") {
    content = {
      videoId: src.video_id ?? "",
      channelId: src.channel_id ?? "",
      channelTitle: src.channel_title ?? "",
      title: src.title,
      description: src.description ?? null,
      thumbnailUrl: src.thumbnail_url ?? null,
      publishedAt: src.published_at,
      viewCount: src.view_count ?? 0,
      likeCount: src.like_count ?? 0,
      duration: src.duration ?? null,
    };
  } else {
    content = { title: src.title };
  }

  // Enriched info (only if has_enriched is true)
  const enriched = src.has_enriched
    ? { summary: src.summary ?? null, hasFullContent: true }
    : undefined;

  return {
    id: dataPointId,
    type,
    fetchedAt: src.fetch_timestamp,
    topic,
    subTopic,
    content,
    enriched,
    isSaved: savedIds.has(dataPointId),
  };
}
