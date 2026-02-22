from __future__ import annotations

import logging
import os
import socket
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx
from langchain_core.tools import tool
from opensearchpy import OpenSearch

from .config import settings

_OS_CLIENT: OpenSearch | None = None
_TAVILY_CLIENT: Any | None = None
_TAVILY_INIT_ERROR: str | None = None
logger = logging.getLogger(__name__)

BACKEND_HEADERS = {
    "X-Origin": "Info",
    "Accept": "application/json",
}


def _clean_api_key(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().strip('"').strip("'") or None


def _get_tavily_client() -> Any | None:
    global _TAVILY_CLIENT, _TAVILY_INIT_ERROR
    if _TAVILY_CLIENT is not None:
        return _TAVILY_CLIENT
    if _TAVILY_INIT_ERROR is not None:
        return None
    try:
        from tavily import TavilyClient  # type: ignore

        api_key = _clean_api_key(os.getenv("TAVILY_API_KEY"))
        if not api_key:
            _TAVILY_INIT_ERROR = "TAVILY_API_KEY is not set"
            return None
        _TAVILY_CLIENT = TavilyClient(api_key=api_key)
        return _TAVILY_CLIENT
    except ImportError:
        _TAVILY_INIT_ERROR = "tavily-python package is not installed"
        logger.warning("tavily-python package not installed; web search disabled")
        return None
    except Exception as exc:
        _TAVILY_INIT_ERROR = str(exc)
        logger.warning("Failed to initialize Tavily client: %s", exc)
        return None


def _os_client() -> OpenSearch:
    global _OS_CLIENT
    if _OS_CLIENT is not None:
        return _OS_CLIENT
    parsed = settings.opensearch_url.replace("http://", "").replace("https://", "")
    host, port = parsed.split(":") if ":" in parsed else (parsed, "9200")
    _OS_CLIENT = OpenSearch(
        hosts=[{"host": host, "port": int(port)}],
        http_compress=True,
        use_ssl=False,
        verify_certs=False,
        ssl_show_warn=False,
    )
    return _OS_CLIENT


def _to_time_gte(time_range: str | None) -> str | None:
    if not time_range:
        return None
    now = datetime.now(timezone.utc)
    if time_range == "24h":
        return (now - timedelta(hours=24)).isoformat()
    if time_range == "7d":
        return (now - timedelta(days=7)).isoformat()
    if time_range == "30d":
        return (now - timedelta(days=30)).isoformat()
    return None


def _build_filters(
    topic_id: int | None,
    subtopic_id: int | None,
    source_type: str | None,
    time_range: str | None,
) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = []
    if topic_id is not None:
        filters.append({"term": {"topic_id": topic_id}})
    if subtopic_id is not None:
        filters.append({"term": {"subtopic_id": subtopic_id}})
    if source_type:
        filters.append({"term": {"source_type": source_type}})
    gte = _to_time_gte(time_range)
    if gte:
        filters.append({"range": {"fetch_timestamp": {"gte": gte}}})
    return filters


def _normalize_hits(raw_hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for h in raw_hits:
        src = h.get("_source", {})
        out.append(
            {
                "data_point_id": src.get("data_point_id") or h.get("_id"),
                "title": src.get("title") or "",
                "source_type": src.get("source_type") or "",
                "score": float(h.get("_score") or 0.0),
                "snippet": src.get("summary") or src.get("description") or src.get("content"),
                "url": src.get("url"),
                "published_at": src.get("published_at"),
                "fetch_timestamp": src.get("fetch_timestamp"),
            }
        )
    return out


def _search_indices(index_names: tuple[str, ...], body: dict[str, Any]) -> list[dict[str, Any]]:
    client = _os_client()
    hits: list[dict[str, Any]] = []
    for index_name in index_names:
        try:
            result = client.search(index=index_name, body=body)
            hits.extend(result.get("hits", {}).get("hits", []))
        except Exception:
            # Index may not exist yet; skip to keep agent resilient.
            continue
    return hits


@tool
def keyword_os_search(
    query: str,
    topic_id: int | None = None,
    subtopic_id: int | None = None,
    source_type: str | None = None,
    time_range: str | None = None,
    top_k: int = 8,
) -> dict[str, Any]:
    """Keyword-based OpenSearch retrieval over news_index and yt_index."""
    top_k = max(1, min(top_k, 20))
    filters = _build_filters(topic_id, subtopic_id, source_type, time_range)
    body = {
        "query": {
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": query,
                            "fields": ["title^3", "summary^2", "description", "content"],
                            "fuzziness": "AUTO",
                        }
                    }
                ],
                "filter": filters,
            }
        },
        "size": top_k,
        "sort": [{"_score": {"order": "desc"}}, {"fetch_timestamp": {"order": "desc"}}],
    }
    hits = _search_indices((settings.opensearch_news_index, settings.opensearch_yt_index), body)
    hits.sort(key=lambda x: float(x.get("_score", 0.0)), reverse=True)
    return {"items": _normalize_hits(hits[:top_k]), "mode": "keyword"}


@tool
def vector_os_search(
    query: str,
    topic_id: int | None = None,
    subtopic_id: int | None = None,
    source_type: str | None = None,
    time_range: str | None = None,
    top_k: int = 8,
) -> dict[str, Any]:
    """Vector retrieval placeholder. Uses keyword fallback until query embeddings are aligned to index embedding model."""
    result = keyword_os_search.invoke(
        {
            "query": query,
            "topic_id": topic_id,
            "subtopic_id": subtopic_id,
            "source_type": source_type,
            "time_range": time_range,
            "top_k": top_k,
        }
    )
    result["mode"] = "vector_fallback_keyword"
    result["note"] = "Query embeddings are not wired yet for the current index embedding model."
    return result


@tool
def hybrid_os_search(
    query: str,
    topic_id: int | None = None,
    subtopic_id: int | None = None,
    source_type: str | None = None,
    time_range: str | None = None,
    top_k: int = 8,
) -> dict[str, Any]:
    """Hybrid retrieval that merges keyword and vector candidate sets and deduplicates by data_point_id."""
    top_k = max(1, min(top_k, 20))
    keyword = keyword_os_search.invoke(
        {
            "query": query,
            "topic_id": topic_id,
            "subtopic_id": subtopic_id,
            "source_type": source_type,
            "time_range": time_range,
            "top_k": top_k,
        }
    )["items"]
    vector = vector_os_search.invoke(
        {
            "query": query,
            "topic_id": topic_id,
            "subtopic_id": subtopic_id,
            "source_type": source_type,
            "time_range": time_range,
            "top_k": top_k,
        }
    )["items"]
    by_id: dict[str, dict[str, Any]] = {}
    for item in keyword + vector:
        key = item.get("data_point_id")
        if key and key not in by_id:
            by_id[key] = item
    return {"items": list(by_id.values())[:top_k], "mode": "hybrid"}


@tool
def get_full_content(data_point_id: str) -> dict[str, Any]:
    """Fetch canonical full content by data_point_id from backend feed endpoint."""
    url = f"{settings.backend_base_url}/api/feed/{data_point_id}"
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=BACKEND_HEADERS)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        return {"error": str(exc), "data_point_id": data_point_id}


@tool
def get_trending_content(
    time_range: str = "24h",
    limit: int = 10,
    topic_limit: int = 6,
) -> dict[str, Any]:
    """Fetch trending items and topic aggregates from backend trending endpoint."""
    limit = max(1, min(limit, 30))
    topic_limit = max(1, min(topic_limit, 20))
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{settings.backend_base_url}/api/trending",
                params={"timeRange": time_range, "limit": limit, "topicLimit": topic_limit},
                headers=BACKEND_HEADERS,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        return {"error": str(exc), "time_range": time_range}


@tool("search_web")
def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = True,
) -> str:
    """
    Search the internet using Tavily for general knowledge, policy, and external context.
    """
    if not settings.agent_enable_web_search:
        return "❌ Web search is disabled. Set AGENT_ENABLE_WEB_SEARCH=true to enable it."

    tavily_client = _get_tavily_client()
    if tavily_client is None:
        reason = _TAVILY_INIT_ERROR or "Unknown Tavily initialization error"
        return f"❌ Web search is not available: {reason}"

    max_results = max(1, min(max_results, 10))
    logger.info("Running Tavily web search", extra={"event": "web_search_started", "topic": topic, "max_results": max_results})

    try:
        # Connectivity precheck for clearer operator errors.
        socket.create_connection(("api.tavily.com", 443), timeout=10)
    except Exception as conn_error:
        logger.error("Web search connectivity failed: %s", conn_error)
        return f"❌ Network connectivity issue: Cannot reach api.tavily.com ({conn_error})"

    try:
        search_results = tavily_client.search(
            query=query,
            max_results=max_results,
            include_raw_content=include_raw_content,
            topic=topic,
        )
    except Exception as exc:
        logger.error("Tavily search failed: %s", exc)
        return f"❌ Error performing web search: {exc}"

    results = search_results.get("results", []) if isinstance(search_results, dict) else []
    if not results:
        return f"🔍 No search results found for: {query}"

    formatted_parts = [f"🌐 **Web Search Results for:** {query}\n"]
    for i, result in enumerate(results, 1):
        title = result.get("title", "Untitled")
        url = result.get("url", "Unknown")
        snippet = result.get("content") or result.get("snippet") or "No summary available"
        formatted_parts.append(f"\n**{i}. {title}**")
        formatted_parts.append(f"Source: {url}")
        formatted_parts.append(f"Summary: {snippet}")
        if include_raw_content and result.get("raw_content"):
            raw_content = str(result.get("raw_content"))
            if len(raw_content) > 2500:
                raw_content = raw_content[:2500] + "... [truncated]"
            formatted_parts.append(f"Content: {raw_content}")

    formatted_parts.append(f"\n💡 **Search Summary:** Found {len(results)} results for '{query}'")
    return "\n".join(formatted_parts)


ALL_TOOLS = [
    hybrid_os_search,
    keyword_os_search,
    vector_os_search,
    internet_search,
    get_full_content,
    get_trending_content,
]
