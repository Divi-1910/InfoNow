import asyncio
import html
import logging
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qs, urlparse

import aiohttp
import trafilatura

logger = logging.getLogger(__name__)


@dataclass
class FetchResult:
    html_body: Optional[str]
    final_url: str
    provider: str
    status_code: Optional[int] = None
    error: Optional[str] = None


class URLPolicy:
    """Policy layer for filtering known non-article URLs."""

    def __init__(self, blocked_domains: list[str], blocked_path_keywords: list[str]):
        self.blocked_domains = [d.lower().strip() for d in blocked_domains if d.strip()]
        self.blocked_path_keywords = [k.lower().strip() for k in blocked_path_keywords if k.strip()]

    def is_blocked(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            domain = (parsed.netloc or "").lower()
            path = (parsed.path or "").lower()
        except Exception:
            return False

        if any(domain == d or domain.endswith(f".{d}") for d in self.blocked_domains):
            return True
        if any(keyword in path for keyword in self.blocked_path_keywords):
            return True
        return False

    def resolve_candidate_url(self, url: str) -> str:
        """Try to resolve nested redirect targets from common query params."""
        try:
            parsed = urlparse(url)
            query_map = parse_qs(parsed.query)
        except Exception:
            return url

        for key in ("url", "u", "target", "redirect", "redirect_uri", "dest", "destination"):
            values = query_map.get(key)
            if not values:
                continue
            candidate = values[0].strip()
            if candidate.startswith("http://") or candidate.startswith("https://"):
                return candidate
        return url


class BaseFetcher:
    name = "base"

    async def fetch(self, url: str) -> FetchResult:
        raise NotImplementedError


class AiohttpFetcher(BaseFetcher):
    name = "aiohttp"

    def __init__(self, timeout: aiohttp.ClientTimeout, user_agent: str):
        self.timeout = timeout
        self.user_agent = user_agent

    async def fetch(self, url: str) -> FetchResult:
        headers = {"User-Agent": self.user_agent}
        try:
            async with aiohttp.ClientSession(timeout=self.timeout, headers=headers) as session:
                async with session.get(url, ssl=False, allow_redirects=True) as response:
                    if response.status != 200:
                        return FetchResult(
                            html_body=None,
                            final_url=str(response.url),
                            provider=self.name,
                            status_code=response.status,
                            error=f"http_{response.status}",
                        )
                    body = await response.text()
                    return FetchResult(
                        html_body=body,
                        final_url=str(response.url),
                        provider=self.name,
                        status_code=response.status,
                    )
        except Exception as exc:
            return FetchResult(
                html_body=None,
                final_url=url,
                provider=self.name,
                error=str(exc),
            )


class TrafilaturaURLFetcher(BaseFetcher):
    name = "trafilatura_url"

    async def fetch(self, url: str) -> FetchResult:
        def _sync_fetch() -> Optional[str]:
            return trafilatura.fetch_url(url)

        try:
            body = await asyncio.to_thread(_sync_fetch)
            return FetchResult(
                html_body=body,
                final_url=url,
                provider=self.name,
                status_code=200 if body else None,
                error=None if body else "empty_body",
            )
        except Exception as exc:
            return FetchResult(
                html_body=None,
                final_url=url,
                provider=self.name,
                error=str(exc),
            )


class BaseExtractor:
    name = "base"

    def extract(self, raw_html: str) -> Optional[str]:
        raise NotImplementedError


class TrafilaturaExtractor(BaseExtractor):
    name = "trafilatura"

    def extract(self, raw_html: str) -> Optional[str]:
        return trafilatura.extract(
            raw_html,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
        )


class HeuristicExtractor(BaseExtractor):
    name = "heuristic"

    def extract(self, raw_html: str) -> Optional[str]:
        cleaned = re.sub(r"(?is)<script.*?>.*?</script>", " ", raw_html)
        cleaned = re.sub(r"(?is)<style.*?>.*?</style>", " ", cleaned)
        cleaned = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", cleaned)
        cleaned = re.sub(r"(?is)<[^>]+>", " ", cleaned)
        return html.unescape(cleaned)


class ScrapePipeline:
    """Composable pipeline: URL policy -> fetch providers -> extractors -> normalization."""

    def __init__(
        self,
        fetchers: list[BaseFetcher],
        extractors: list[BaseExtractor],
        url_policy: URLPolicy,
        min_content_chars: int,
    ):
        self.fetchers = fetchers
        self.extractors = extractors
        self.url_policy = url_policy
        self.min_content_chars = min_content_chars

    async def run(self, input_url: str) -> Optional[str]:
        url = self.url_policy.resolve_candidate_url(input_url)
        if self.url_policy.is_blocked(url):
            logger.warning(
                "Skipping URL due to policy",
                extra={"event": "article_url_blocked", "url": url},
            )
            return None

        for fetcher in self.fetchers:
            result = await fetcher.fetch(url)
            if not result.html_body:
                logger.warning(
                    "Fetcher failed for URL",
                    extra={
                        "event": "article_fetch_failed",
                        "url": url,
                        "provider": result.provider,
                        "status_code": result.status_code,
                        "error": result.error,
                    },
                )
                continue

            for extractor in self.extractors:
                extracted = self._normalize_text(extractor.extract(result.html_body))
                if extracted and len(extracted) >= self.min_content_chars:
                    logger.debug(
                        "Content extracted",
                        extra={
                            "event": "article_extracted",
                            "url": result.final_url,
                            "fetch_provider": result.provider,
                            "extractor": extractor.name,
                            "content_chars": len(extracted),
                        },
                    )
                    return extracted

            logger.warning(
                "No extractor produced sufficient content",
                extra={
                    "event": "article_extract_failed",
                    "url": result.final_url,
                    "fetch_provider": result.provider,
                    "min_content_chars": self.min_content_chars,
                },
            )

        return None

    @staticmethod
    def _normalize_text(text: Optional[str]) -> Optional[str]:
        if not text:
            return None
        normalized = re.sub(r"\s+", " ", text).strip()
        return normalized or None


class ArticleScraper:
    """Async article scraper with retry + provider/extractor architecture."""

    def __init__(
        self,
        max_concurrent: int = 10,
        timeout: int = 10,
        max_retries: int = 2,
        backoff_seconds: float = 0.75,
        min_content_chars: int = 100,
        user_agent: Optional[str] = None,
        extractor_order: Optional[list[str]] = None,
        blocked_domains: Optional[list[str]] = None,
        blocked_path_keywords: Optional[list[str]] = None,
    ):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.max_retries = max_retries
        self.backoff_seconds = backoff_seconds
        self.user_agent = (
            user_agent
            or "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        self.extractor_order = extractor_order or ["trafilatura", "heuristic"]
        self.url_policy = URLPolicy(blocked_domains or [], blocked_path_keywords or [])
        self.pipeline = ScrapePipeline(
            fetchers=[
                AiohttpFetcher(timeout=self.timeout, user_agent=self.user_agent),
                TrafilaturaURLFetcher(),
            ],
            extractors=self._build_extractors(self.extractor_order),
            url_policy=self.url_policy,
            min_content_chars=min_content_chars,
        )

    async def scrape(self, url: str) -> Optional[str]:
        """
        Fetch and extract article content from URL.
        Returns extracted text or None if failed.
        """
        async with self.semaphore:
            attempts = self.max_retries + 1
            for attempt in range(1, attempts + 1):
                extracted = await self.pipeline.run(url)
                if extracted:
                    logger.debug(
                        "Article scraped successfully",
                        extra={
                            "event": "article_scrape_succeeded",
                            "url": url,
                            "attempt": attempt,
                            "content_chars": len(extracted),
                        },
                    )
                    return extracted

                if attempt < attempts:
                    await asyncio.sleep(self.backoff_seconds * attempt)

            logger.warning(
                "Article scrape exhausted retries",
                extra={
                    "event": "article_scrape_exhausted",
                    "url": url,
                    "attempts": attempts,
                },
            )
            return None

    @staticmethod
    def _build_extractors(order: list[str]) -> list[BaseExtractor]:
        registry = {
            "trafilatura": TrafilaturaExtractor(),
            "heuristic": HeuristicExtractor(),
        }
        extractors: list[BaseExtractor] = []
        for name in order:
            extractor = registry.get(name)
            if extractor:
                extractors.append(extractor)
            else:
                logger.debug(
                    "Unknown extractor strategy configured",
                    extra={"event": "article_extractor_unknown", "extractor": name},
                )
        if not extractors:
            extractors = [TrafilaturaExtractor(), HeuristicExtractor()]
        return extractors

    async def scrape_batch(self, urls: list[str]) -> dict[str, Optional[str]]:
        """
        Scrape multiple URLs concurrently.
        Returns dict mapping URL to content (or None if failed).
        """
        tasks = [self.scrape(url) for url in urls]
        results = await asyncio.gather(*tasks)
        return dict(zip(urls, results))
