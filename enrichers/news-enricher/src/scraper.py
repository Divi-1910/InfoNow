import asyncio
import logging
from typing import Optional
import aiohttp
import trafilatura

logger = logging.getLogger(__name__)


class ArticleScraper:
    """Async article scraper using trafilatura for content extraction"""

    def __init__(self, max_concurrent: int = 10, timeout: int = 10):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.timeout = aiohttp.ClientTimeout(total=timeout)

    async def scrape(self, url: str) -> Optional[str]:
        """
        Fetch and extract article content from URL.
        Returns extracted text or None if failed.
        """
        async with self.semaphore:
            try:
                async with aiohttp.ClientSession(timeout=self.timeout) as session:
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                    async with session.get(url, headers=headers, ssl=False) as response:
                        if response.status != 200:
                            logger.warning(f"Failed to fetch {url}: HTTP {response.status}")
                            return None

                        html = await response.text()

                        # Use trafilatura for content extraction
                        content = trafilatura.extract(
                            html,
                            include_comments=False,
                            include_tables=False,
                            no_fallback=False,
                        )

                        if not content or len(content) < 100:
                            logger.warning(f"No content extracted from {url}")
                            return None

                        return content

            except asyncio.TimeoutError:
                logger.warning(f"Timeout fetching {url}")
                return None
            except aiohttp.ClientError as e:
                logger.warning(f"Client error fetching {url}: {e}")
                return None
            except Exception as e:
                logger.error(f"Unexpected error scraping {url}: {e}")
                return None

    async def scrape_batch(self, urls: list[str]) -> dict[str, Optional[str]]:
        """
        Scrape multiple URLs concurrently.
        Returns dict mapping URL to content (or None if failed).
        """
        tasks = [self.scrape(url) for url in urls]
        results = await asyncio.gather(*tasks)
        return dict(zip(urls, results))
