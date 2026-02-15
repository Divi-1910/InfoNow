import asyncio
import logging
import signal
import sys
from datetime import datetime

from .config import settings
from .consumer import KafkaConsumer
from .scraper import ArticleScraper
from .chunker import HybridChunker
from .embedder import OllamaEmbedder
from .summarizer import OllamaSummarizer
from .storage import PostgresStorage, OpenSearchStorage
from .models import CleanNewsPoint, OpenSearchDocument
from .outbox_publisher import OutboxPublisher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class NewsEnricher:
    """Main enricher service that orchestrates the pipeline"""

    def __init__(self):
        self.running = True

        # Initialize components
        logger.info("Initializing News Enricher components...")

        self.consumer = KafkaConsumer(
            brokers=settings.kafka_brokers_list,
            topic=settings.kafka_input_topic,
            group_id=settings.kafka_consumer_group,
        )

        self.scraper = ArticleScraper(
            max_concurrent=settings.scraper_workers,
            timeout=settings.scraper_timeout_seconds,
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

        # Initialize outbox publisher for reliable OpenSearch indexing
        self.outbox_publisher = OutboxPublisher(
            database_url=settings.database_url,
            opensearch=self.opensearch,
            poll_interval=settings.outbox_poll_interval,
            batch_size=settings.outbox_batch_size,
            max_retries=settings.outbox_max_retries,
        )
        self.outbox_publisher.connect()

        logger.info("All components initialized successfully")

    async def process_article(self, article: CleanNewsPoint) -> bool:
        """Process a single article through the enrichment pipeline"""
        try:
            # Check if already enriched
            if self.postgres.check_already_enriched(article.data_point_id):
                logger.debug(f"Article {article.data_point_id} already enriched, skipping")
                return True

            # Step 1: Scrape full content
            logger.debug(f"Scraping {article.url}")
            full_content = await self.scraper.scrape(article.url)

            if not full_content:
                logger.warning(f"Failed to scrape content for {article.url}")
                return False

            # Step 2: Chunk the content
            chunks = self.chunker.chunk(full_content)
            if not chunks:
                logger.warning(f"No chunks created for {article.url}")
                return False

            logger.debug(f"Created {len(chunks)} chunks")

            # Step 3: Generate embeddings
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
                logger.warning(f"No valid embeddings for {article.url}")
                return False

            # Build OpenSearch documents for outbox
            os_documents = [
                OpenSearchDocument(
                    data_id=article.id,
                    data_point_id=article.data_point_id,
                    source_type="news",
                    topic=article.topic,
                    subtopic=article.subtopic,
                    title=article.title,
                    url=article.url,
                    source_name=article.source_name,
                    published_at=article.published_at,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    embedding=embedding,
                )
                for chunk, embedding in zip(valid_chunks, valid_embeddings)
            ]

            # Step 4: Save to PostgreSQL + create OutboxEvent (single transaction)
            # The outbox publisher will handle OpenSearch indexing asynchronously
            summary = await asyncio.to_thread(
                self.summarizer.summarize,
                article.title,
                full_content,
                settings.summary_input_max_chars,
            )
            self.postgres.save_enriched_article(
                data_point_id=article.data_point_id,
                full_content=full_content,
                summary=summary,
                chunks=valid_chunks,
                embeddings=valid_embeddings,
                opensearch_documents=os_documents,
                opensearch_index=settings.opensearch_index,
            )

            logger.info(
                f"Enriched article: {article.title[:50]}... "
                f"({len(valid_chunks)} chunks queued for indexing)"
            )
            return True

        except Exception as e:
            logger.error(f"Error processing article {article.url}: {e}")
            return False

    async def run(self):
        """Main processing loop"""
        # Start outbox publisher as background task
        outbox_task = asyncio.create_task(self.outbox_publisher.start())
        logger.info("Starting enrichment loop...")

        while self.running:
            try:
                article = self.consumer.fetch_one()
                if not article:
                    await asyncio.sleep(1)
                    continue

                success = await self.process_article(article)
                if success:
                    self.consumer.commit()
                    logger.info(f"Processed and committed article: {article.data_point_id}")
                else:
                    logger.warning(
                        f"Processing failed for article {article.data_point_id}, offset not committed"
                    )

            except Exception as e:
                logger.error(f"Error in processing loop: {e}")
                await asyncio.sleep(5)

    def shutdown(self):
        """Graceful shutdown"""
        logger.info("Shutting down...")
        self.running = False
        self.outbox_publisher.stop()
        self.outbox_publisher.close()
        self.consumer.close()
        self.postgres.close()
        self.opensearch.close()
        logger.info("Shutdown complete")


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
