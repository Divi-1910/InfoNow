import asyncio
import html
import logging
import re
from typing import Optional
import aiohttp
import trafilatura

logger = logging.getLogger(__name__)


class ArticleScraper:
    """Async article scraper with retry + multi-strategy extraction."""

    def __init__(
        self,
        max_concurrent: int = 10,
        timeout: int = 10,
        max_retries: int = 2,
        backoff_seconds: float = 0.75,
        min_content_chars: int = 100,
        user_agent: Optional[str] = None,
        extractor_order: Optional[list[str]] = None,
    ):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.max_retries = max_retries
        self.backoff_seconds = backoff_seconds
        self.min_content_chars = min_content_chars
        self.user_agent = (
            user_agent
            or "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        self.extractor_order = extractor_order or ["trafilatura", "heuristic"]

    async def scrape(self, url: str) -> Optional[str]:
        """
        Fetch and extract article content from URL.
        Returns extracted text or None if failed.
        """
        async with self.semaphore:
            attempts = self.max_retries + 1
            for attempt in range(1, attempts + 1):
                try:
                    fetched_html = await self._fetch_html(url)
                    if not fetched_html:
                        logger.warning(
                            "Fetched empty HTML",
                            extra={
                                "event": "article_fetch_empty",
                                "url": url,
                                "attempt": attempt,
                                "max_attempts": attempts,
                            },
                        )
                    else:
                        extracted = self._extract_content(url, fetched_html)
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
                except asyncio.TimeoutError:
                    logger.warning(
                        "Timeout fetching article",
                        extra={
                            "event": "article_fetch_timeout",
                            "url": url,
                            "attempt": attempt,
                            "max_attempts": attempts,
                        },
                    )
                    if attempt < attempts:
                        await asyncio.sleep(self.backoff_seconds * attempt)
                except aiohttp.ClientError as e:
                    logger.warning(
                        "HTTP client error while fetching article",
                        extra={
                            "event": "article_fetch_client_error",
                            "url": url,
                            "attempt": attempt,
                            "max_attempts": attempts,
                            "error": str(e),
                        },
                    )
                    if attempt < attempts:
                        await asyncio.sleep(self.backoff_seconds * attempt)
                except Exception as e:
                    logger.error(
                        "Unexpected scraping error",
                        extra={
                            "event": "article_scrape_unexpected_error",
                            "url": url,
                            "attempt": attempt,
                            "max_attempts": attempts,
                            "error": str(e),
                        },
                    )
                    return None

            logger.warning(
                "Article scrape exhausted retries",
                extra={
                    "event": "article_scrape_exhausted",
                    "url": url,
                    "attempts": attempts,
                },
            )
            return None

    async def _fetch_html(self, url: str) -> Optional[str]:
        headers = {"User-Agent": self.user_agent}
        async with aiohttp.ClientSession(timeout=self.timeout, headers=headers) as session:
            async with session.get(url, ssl=False, allow_redirects=True) as response:
                if response.status != 200:
                    logger.warning(
                        "Non-200 response for article fetch",
                        extra={
                            "event": "article_fetch_non_200",
                            "url": url,
                            "status_code": response.status,
                        },
                    )
                    return None
                return await response.text()

    def _extract_content(self, url: str, raw_html: str) -> Optional[str]:
        for extractor in self.extractor_order:
            if extractor == "trafilatura":
                extracted = self._extract_with_trafilatura(raw_html)
            elif extractor == "heuristic":
                extracted = self._extract_with_heuristic(raw_html)
            else:
                logger.debug(
                    "Unknown extractor strategy configured",
                    extra={"event": "article_extractor_unknown", "extractor": extractor},
                )
                continue

            normalized = self._normalize_text(extracted)
            if normalized and len(normalized) >= self.min_content_chars:
                logger.debug(
                    "Content extracted using strategy",
                    extra={
                        "event": "article_extracted",
                        "url": url,
                        "extractor": extractor,
                        "content_chars": len(normalized),
                    },
                )
                return normalized

        logger.warning(
            "No extractor produced sufficient content",
            extra={
                "event": "article_extract_failed",
                "url": url,
                "min_content_chars": self.min_content_chars,
                "extractors": self.extractor_order,
            },
        )
        return None

    def _extract_with_trafilatura(self, raw_html: str) -> Optional[str]:
        return trafilatura.extract(
            raw_html,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
        )

    def _extract_with_heuristic(self, raw_html: str) -> Optional[str]:
        # Fast fallback for sites where trafilatura misses content.
        cleaned = re.sub(r"(?is)<script.*?>.*?</script>", " ", raw_html)
        cleaned = re.sub(r"(?is)<style.*?>.*?</style>", " ", cleaned)
        cleaned = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", cleaned)
        cleaned = re.sub(r"(?is)<[^>]+>", " ", cleaned)
        cleaned = html.unescape(cleaned)
        return cleaned

    def _normalize_text(self, text: Optional[str]) -> Optional[str]:
        if not text:
            return None
        normalized = re.sub(r"\s+", " ", text).strip()
        return normalized or None

    async def scrape_batch(self, urls: list[str]) -> dict[str, Optional[str]]:
        """
        Scrape multiple URLs concurrently.
        Returns dict mapping URL to content (or None if failed).
        """
        tasks = [self.scrape(url) for url in urls]
        results = await asyncio.gather(*tasks)
        return dict(zip(urls, results))
