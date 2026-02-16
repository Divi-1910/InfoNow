import asyncio
import logging
import signal
import sys
import time

from .config import settings
from .consumer import KafkaConsumer
from .scraper import ArticleScraper
from .chunker import HybridChunker
from .embedder import OllamaEmbedder
from .summarizer import OllamaSummarizer
from .storage import PostgresStorage, OpenSearchStorage, MegaOpenSearchStorage
from .models import CleanNewsPoint, OpenSearchDocument, MegaDocument
from .outbox_publisher import OutboxPublisher
from .logging_utils import configure_logging

configure_logging(settings.log_level, settings.log_format)
logger = logging.getLogger(__name__)


class NewsEnricher:
    """Main enricher service that orchestrates the pipeline"""

    def __init__(self):
        self.running = True

        # Initialize components
        logger.info(
            "Initializing News Enricher components",
            extra={
                "event": "service_initializing",
                "kafka_input_topic": settings.kafka_input_topic,
                "kafka_group_id": settings.kafka_consumer_group,
                "opensearch_index": settings.opensearch_index,
                "ollama_embed_model": settings.ollama_model,
                "ollama_summary_model": settings.ollama_summary_model,
                "log_level": settings.log_level,
                "log_format": settings.log_format,
            },
        )

        self.consumer = KafkaConsumer(
            brokers=settings.kafka_brokers_list,
            topic=settings.kafka_input_topic,
            group_id=settings.kafka_consumer_group,
        )

        self.scraper = ArticleScraper(
            max_concurrent=settings.scraper_workers,
            timeout=settings.scraper_timeout_seconds,
            max_retries=settings.scraper_max_retries,
            backoff_seconds=settings.scraper_backoff_seconds,
            min_content_chars=settings.scraper_min_content_chars,
            user_agent=settings.scraper_user_agent,
            extractor_order=[e.strip() for e in settings.scraper_extractor_order.split(",") if e.strip()],
        )

        self.chunker = HybridChunker(max_tokens=settings.max_chunk_tokens)

        self.embedder = OllamaEmbedder(
            model=settings.ollama_model,
            host=settings.ollama_url,
        )
        self.summarizer = OllamaSummarizer(
            model=settings.ollama_summary_model,
            host=settings.ollama_url,
        )

        self.postgres = PostgresStorage(settings.database_url)
        self.postgres.connect()

        self.opensearch = OpenSearchStorage(
            url=settings.opensearch_url,
            index_name=settings.opensearch_index,
            embedding_dimension=settings.embedding_dimension,
        )
        self.opensearch.create_index_if_not_exists()

        self.mega_opensearch = MegaOpenSearchStorage(url=settings.opensearch_url)

        # Initialize outbox publisher for reliable OpenSearch indexing
        self.outbox_publisher = OutboxPublisher(
            database_url=settings.database_url,
            opensearch=self.opensearch,
            mega_opensearch=self.mega_opensearch,
            poll_interval=settings.outbox_poll_interval,
            batch_size=settings.outbox_batch_size,
            max_retries=settings.outbox_max_retries,
        )
        self.outbox_publisher.connect()

        logger.info("All components initialized successfully", extra={"event": "service_initialized"})

    async def process_article(self, article: CleanNewsPoint) -> bool:
        """Process a single article through the enrichment pipeline"""
        start = time.perf_counter()
        try:
            logger.info(
                "Starting article enrichment",
                extra={
                    "event": "article_processing_started",
                    "data_point_id": article.data_point_id,
                    "topic": article.topic,
                    "subtopic": article.subtopic,
                    "url": article.url,
                },
            )

            # Check if already enriched
            if self.postgres.check_already_enriched(article.data_point_id):
                logger.info(
                    "Article already enriched, skipping",
                    extra={"event": "article_skipped_already_enriched", "data_point_id": article.data_point_id},
                )
                return True

            # Step 1: Scrape full content
            step_start = time.perf_counter()
            full_content = await self.scraper.scrape(article.url)

            if not full_content:
                logger.warning(
                    "Failed to scrape article content",
                    extra={"event": "article_scrape_failed", "data_point_id": article.data_point_id, "url": article.url},
                )
                return False
            logger.info(
                "Article content scraped",
                extra={
                    "event": "article_scraped",
                    "data_point_id": article.data_point_id,
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                    "content_chars": len(full_content),
                },
            )

            # Step 2: Chunk the content
            step_start = time.perf_counter()
            chunks = self.chunker.chunk(full_content)
            if not chunks:
                logger.warning(
                    "No chunks created for article",
                    extra={"event": "article_chunking_failed", "data_point_id": article.data_point_id},
                )
                return False

            logger.info(
                "Article chunked",
                extra={
                    "event": "article_chunked",
                    "data_point_id": article.data_point_id,
                    "chunk_count": len(chunks),
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                },
            )

            # Step 3: Generate embeddings
            step_start = time.perf_counter()
            chunk_texts = [chunk.content for chunk in chunks]
            embeddings = self.embedder.embed_batch(chunk_texts)

            # Filter out failed embeddings
            valid_chunks = []
            valid_embeddings = []
            for chunk, embedding in zip(chunks, embeddings):
                if embedding:
                    valid_chunks.append(chunk)
                    valid_embeddings.append(embedding)

            if not valid_chunks:
                logger.warning(
                    "No valid embeddings generated",
                    extra={"event": "article_embedding_failed", "data_point_id": article.data_point_id},
                )
                return False
            logger.info(
                "Generated embeddings",
                extra={
                    "event": "article_embedded",
                    "data_point_id": article.data_point_id,
                    "requested_embeddings": len(chunks),
                    "valid_embeddings": len(valid_embeddings),
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                },
            )

            # Look up topic/subtopic IDs and names by slug
            topic_id, topic_name, subtopic_id, subtopic_name = self.postgres.get_topic_by_slug(
                article.topic, article.subtopic
            )

            # Step 4: Generate summary
            step_start = time.perf_counter()
            summary = await asyncio.to_thread(
                self.summarizer.summarize,
                article.title,
                full_content,
                settings.summary_input_max_chars,
            )
            logger.info(
                "Generated summary",
                extra={
                    "event": "article_summarized",
                    "data_point_id": article.data_point_id,
                    "has_summary": bool(summary),
                    "summary_chars": len(summary) if summary else 0,
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                },
            )

            # Build OpenSearch chunk documents for news_index outbox
            os_documents = [
                OpenSearchDocument(
                    data_id=article.id,
                    data_point_id=article.data_point_id,
                    source_type="news",
                    topic_id=topic_id,
                    topic_name=topic_name,
                    topic_slug=article.topic,
                    subtopic_id=subtopic_id,
                    subtopic_name=subtopic_name,
                    subtopic_slug=article.subtopic,
                    title=article.title,
                    description=article.description,
                    url=article.url,
                    source_name=article.source_name,
                    author=article.author,
                    image_url=article.image_url,
                    published_at=article.published_at,
                    fetch_timestamp=article.fetch_timestamp,
                    summary=summary,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    embedding=embedding,
                )
                for chunk, embedding in zip(valid_chunks, valid_embeddings)
            ]

            # Build MegaDocument for mega_index upsert
            mega_doc = MegaDocument(
                data_point_id=article.data_point_id,
                source_type="news",
                fetch_timestamp=article.fetch_timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                topic_id=topic_id,
                topic_name=topic_name,
                topic_slug=article.topic,
                subtopic_id=subtopic_id,
                subtopic_name=subtopic_name,
                subtopic_slug=article.subtopic,
                title=article.title,
                description=article.description,
                summary=summary,
                has_enriched=True,
                published_at=article.published_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                url=article.url,
                source_name=article.source_name,
                author=article.author,
                image_url=article.image_url,
            )

            # Step 5: Save to PostgreSQL + create OutboxEvents (single transaction)
            # The outbox publisher will handle OpenSearch indexing asynchronously
            self.postgres.save_enriched_article(
                data_point_id=article.data_point_id,
                full_content=full_content,
                summary=summary,
                chunks=valid_chunks,
                embeddings=valid_embeddings,
                opensearch_documents=os_documents,
                opensearch_index=settings.opensearch_index,
                mega_document=mega_doc,
            )

            logger.info(
                "Article enrichment completed",
                extra={
                    "event": "article_processing_completed",
                    "data_point_id": article.data_point_id,
                    "chunk_count": len(valid_chunks),
                    "summary_chars": len(summary) if summary else 0,
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                },
            )
            return True

        except Exception as e:
            logger.error(
                "Error processing article",
                extra={
                    "event": "article_processing_failed",
                    "data_point_id": article.data_point_id,
                    "url": article.url,
                    "error": str(e),
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                },
            )
            return False

    async def run(self):
        """Main processing loop"""
        # Start outbox publisher as background task
        outbox_task = asyncio.create_task(self.outbox_publisher.start())
        logger.info("Starting enrichment loop", extra={"event": "service_loop_started"})

        while self.running:
            try:
                article = self.consumer.fetch_one()
                if not article:
                    await asyncio.sleep(1)
                    continue

                success = await self.process_article(article)
                if success:
                    self.consumer.commit()
                    logger.info(
                        "Processed and committed article",
                        extra={"event": "article_committed", "data_point_id": article.data_point_id},
                    )
                else:
                    logger.warning(
                        "Processing failed, offset not committed",
                        extra={"event": "article_not_committed", "data_point_id": article.data_point_id},
                    )

            except Exception as e:
                logger.error("Error in processing loop", extra={"event": "service_loop_error", "error": str(e)})
                await asyncio.sleep(5)

    def shutdown(self):
        """Graceful shutdown"""
        logger.info("Shutting down", extra={"event": "service_shutdown_started"})
        self.running = False
        self.outbox_publisher.stop()
        self.outbox_publisher.close()
        self.consumer.close()
        self.postgres.close()
        self.opensearch.close()
        self.mega_opensearch.close()
        logger.info("Shutdown complete", extra={"event": "service_shutdown_completed"})


def main():
    """Entry point"""
    enricher = NewsEnricher()

    # Setup signal handlers
    def signal_handler(sig, frame):
        enricher.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Run the async loop
    asyncio.run(enricher.run())


if __name__ == "__main__":
    main()
