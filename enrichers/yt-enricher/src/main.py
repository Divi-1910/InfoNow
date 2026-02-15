import asyncio
import logging
import signal
import sys

from .chunker import HybridChunker
from .config import settings
from .consumer import KafkaConsumer
from .embedder import OllamaEmbedder
from .summarizer import OllamaSummarizer
from .models import CleanYoutubePoint, OpenSearchDocument, MegaDocument
from .outbox_publisher import OutboxPublisher
from .storage import OpenSearchStorage, PostgresStorage, MegaOpenSearchStorage
from .transcript import TranscriptFetcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class YouTubeEnricher:
    def __init__(self):
        self.running = True
        logger.info("Initializing YouTube Enricher components...")

        self.consumer = KafkaConsumer(
            brokers=settings.kafka_brokers_list,
            topic=settings.kafka_input_topic,
            group_id=settings.kafka_consumer_group,
        )
        self.transcript_fetcher = TranscriptFetcher()
        self.chunker = HybridChunker(max_tokens=settings.max_chunk_tokens)
        self.embedder = OllamaEmbedder(model=settings.ollama_model, host=settings.ollama_url)
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

        self.outbox_publisher = OutboxPublisher(
            database_url=settings.database_url,
            opensearch=self.opensearch,
            mega_opensearch=self.mega_opensearch,
            poll_interval=settings.outbox_poll_interval,
            batch_size=settings.outbox_batch_size,
            max_retries=settings.outbox_max_retries,
        )
        self.outbox_publisher.connect()
        logger.info("YouTube enricher initialized")

    async def process_video(self, video: CleanYoutubePoint) -> bool:
        try:
            if self.postgres.check_already_enriched(video.data_point_id):
                return True

            transcript = await asyncio.to_thread(
                self.transcript_fetcher.fetch,
                video.video_id,
            )
            if not transcript:
                logger.warning("Transcript unavailable for video_id=%s", video.video_id)
                return False

            chunks = self.chunker.chunk(transcript)
            if not chunks:
                logger.warning("No chunks created for video_id=%s", video.video_id)
                return False

            embeddings = self.embedder.embed_batch([chunk.content for chunk in chunks])
            valid_chunks = []
            valid_embeddings = []
            for chunk, embedding in zip(chunks, embeddings):
                if embedding:
                    valid_chunks.append(chunk)
                    valid_embeddings.append(embedding)

            if not valid_chunks:
                logger.warning("No valid embeddings for video_id=%s", video.video_id)
                return False

            # Look up topic/subtopic IDs and names by slug
            topic_id, topic_name, subtopic_id, subtopic_name = self.postgres.get_topic_by_slug(
                video.topic, video.subtopic
            )

            # Generate summary
            summary = await asyncio.to_thread(
                self.summarizer.summarize,
                video.title,
                transcript,
                settings.summary_input_max_chars,
            )

            # Build OpenSearch chunk documents for yt_index outbox
            docs = [
                OpenSearchDocument(
                    data_id=video.id,
                    data_point_id=video.data_point_id,
                    source_type="youtube",
                    topic_id=topic_id,
                    topic_name=topic_name,
                    topic_slug=video.topic,
                    subtopic_id=subtopic_id,
                    subtopic_name=subtopic_name,
                    subtopic_slug=video.subtopic,
                    title=video.title,
                    description=video.description,
                    video_id=video.video_id,
                    channel_id=video.channel_id,
                    channel_title=video.channel_title,
                    thumbnail_url=video.thumbnail_url,
                    published_at=video.published_at,
                    fetch_timestamp=video.fetch_timestamp,
                    duration=video.duration,
                    view_count=video.view_count,
                    like_count=video.like_count,
                    summary=summary,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    embedding=embedding,
                )
                for chunk, embedding in zip(valid_chunks, valid_embeddings)
            ]

            # Build MegaDocument for mega_index upsert
            mega_doc = MegaDocument(
                data_point_id=video.data_point_id,
                source_type="youtube",
                fetch_timestamp=video.fetch_timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                topic_id=topic_id,
                topic_name=topic_name,
                topic_slug=video.topic,
                subtopic_id=subtopic_id,
                subtopic_name=subtopic_name,
                subtopic_slug=video.subtopic,
                title=video.title,
                description=video.description,
                summary=summary,
                has_enriched=True,
                published_at=video.published_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                video_id=video.video_id,
                channel_id=video.channel_id,
                channel_title=video.channel_title,
                thumbnail_url=video.thumbnail_url,
                duration=video.duration,
                view_count=video.view_count,
                like_count=video.like_count,
            )

            self.postgres.save_enriched_video(
                data_point_id=video.data_point_id,
                transcript=transcript,
                summary=summary,
                chunks=valid_chunks,
                embeddings=valid_embeddings,
                opensearch_documents=docs,
                opensearch_index=settings.opensearch_index,
                mega_document=mega_doc,
            )

            logger.info(
                "Enriched YouTube video: %s (%d chunks queued)",
                video.video_id,
                len(valid_chunks),
            )
            return True

        except Exception as exc:
            logger.error("Error processing video_id=%s: %s", video.video_id, exc)
            return False

    async def run(self):
        asyncio.create_task(self.outbox_publisher.start())
        logger.info("Starting YouTube enrichment loop...")

        while self.running:
            try:
                video = self.consumer.fetch_one()
                if not video:
                    await asyncio.sleep(1)
                    continue

                success = await self.process_video(video)
                if success:
                    self.consumer.commit()
                    logger.info("Processed and committed youtube video: %s", video.data_point_id)
                else:
                    logger.warning(
                        "Processing failed for youtube video %s, offset not committed",
                        video.data_point_id,
                    )

            except Exception as exc:
                logger.error("Error in YouTube enrichment loop: %s", exc)
                await asyncio.sleep(5)

    def shutdown(self):
        logger.info("Shutting down YouTube enricher...")
        self.running = False
        self.outbox_publisher.stop()
        self.outbox_publisher.close()
        self.consumer.close()
        self.postgres.close()
        self.opensearch.close()
        self.mega_opensearch.close()
        logger.info("Shutdown complete")


def main():
    enricher = YouTubeEnricher()

    def signal_handler(sig, frame):
        enricher.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    asyncio.run(enricher.run())


if __name__ == "__main__":
    main()
