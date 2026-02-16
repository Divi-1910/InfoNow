import asyncio
import logging
import signal
import sys
import time

from .chunker import HybridChunker
from .config import settings
from .consumer import KafkaConsumer
from .embedder import OllamaEmbedder
from .summarizer import OllamaSummarizer
from .models import CleanYoutubePoint, OpenSearchDocument, MegaDocument
from .outbox_publisher import OutboxPublisher
from .storage import OpenSearchStorage, PostgresStorage, MegaOpenSearchStorage
from .transcript import TranscriptFetcher
from .logging_utils import configure_logging

configure_logging(settings.log_level, settings.log_format)
logger = logging.getLogger(__name__)


class YouTubeEnricher:
    def __init__(self):
        self.running = True
        logger.info(
            "Initializing YouTube Enricher components",
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
        transcript_languages = [s.strip() for s in settings.transcript_languages.split(",") if s.strip()]
        self.transcript_fetcher = TranscriptFetcher(languages=transcript_languages)
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
        logger.info("YouTube enricher initialized", extra={"event": "service_initialized"})

    async def process_video(self, video: CleanYoutubePoint) -> tuple[bool, bool]:
        """
        Process one video.
        Returns:
        - success: processing completed successfully
        - terminal_failure: non-retriable failure (safe to commit offset)
        """
        start = time.perf_counter()
        try:
            logger.info(
                "Starting youtube video enrichment",
                extra={
                    "event": "video_processing_started",
                    "data_point_id": video.data_point_id,
                    "video_id": video.video_id,
                    "topic": video.topic,
                    "subtopic": video.subtopic,
                },
            )
            if self.postgres.check_already_enriched(video.data_point_id):
                logger.info(
                    "Youtube video already enriched, skipping",
                    extra={"event": "video_skipped_already_enriched", "data_point_id": video.data_point_id, "video_id": video.video_id},
                )
                return True, False

            step_start = time.perf_counter()
            transcript = await asyncio.to_thread(
                self.transcript_fetcher.fetch,
                video.video_id,
            )
            if not transcript:
                logger.warning(
                    "Transcript unavailable for youtube video",
                    extra={"event": "video_transcript_unavailable", "video_id": video.video_id, "data_point_id": video.data_point_id},
                )
                # Transcript unavailable is treated as terminal to avoid infinite reprocessing.
                return False, True
            logger.info(
                "Transcript fetched",
                extra={
                    "event": "video_transcript_fetched",
                    "video_id": video.video_id,
                    "data_point_id": video.data_point_id,
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                    "transcript_chars": len(transcript),
                },
            )

            step_start = time.perf_counter()
            chunks = self.chunker.chunk(transcript)
            if not chunks:
                logger.warning(
                    "No chunks created for youtube transcript",
                    extra={"event": "video_chunking_failed", "video_id": video.video_id, "data_point_id": video.data_point_id},
                )
                return False, False
            logger.info(
                "Youtube transcript chunked",
                extra={
                    "event": "video_chunked",
                    "video_id": video.video_id,
                    "data_point_id": video.data_point_id,
                    "chunk_count": len(chunks),
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                },
            )

            step_start = time.perf_counter()
            embeddings = self.embedder.embed_batch([chunk.content for chunk in chunks])
            valid_chunks = []
            valid_embeddings = []
            for chunk, embedding in zip(chunks, embeddings):
                if embedding:
                    valid_chunks.append(chunk)
                    valid_embeddings.append(embedding)

            if not valid_chunks:
                logger.warning(
                    "No valid embeddings for youtube transcript",
                    extra={"event": "video_embedding_failed", "video_id": video.video_id, "data_point_id": video.data_point_id},
                )
                return False, False
            logger.info(
                "Generated youtube embeddings",
                extra={
                    "event": "video_embedded",
                    "video_id": video.video_id,
                    "data_point_id": video.data_point_id,
                    "requested_embeddings": len(chunks),
                    "valid_embeddings": len(valid_embeddings),
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                },
            )

            # Look up topic/subtopic IDs and names by slug
            topic_id, topic_name, subtopic_id, subtopic_name = self.postgres.get_topic_by_slug(
                video.topic, video.subtopic
            )

            # Generate summary
            step_start = time.perf_counter()
            summary = await asyncio.to_thread(
                self.summarizer.summarize,
                video.title,
                transcript,
                settings.summary_input_max_chars,
            )
            logger.info(
                "Generated youtube summary",
                extra={
                    "event": "video_summarized",
                    "video_id": video.video_id,
                    "data_point_id": video.data_point_id,
                    "has_summary": bool(summary),
                    "summary_chars": len(summary) if summary else 0,
                    "duration_ms": int((time.perf_counter() - step_start) * 1000),
                },
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
                "Youtube enrichment completed",
                extra={
                    "event": "video_processing_completed",
                    "video_id": video.video_id,
                    "data_point_id": video.data_point_id,
                    "chunk_count": len(valid_chunks),
                    "summary_chars": len(summary) if summary else 0,
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                },
            )
            return True, False

        except Exception as exc:
            logger.error(
                "Error processing youtube video",
                extra={
                    "event": "video_processing_failed",
                    "video_id": video.video_id,
                    "data_point_id": video.data_point_id,
                    "error": str(exc),
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                },
            )
            return False, False

    async def run(self):
        asyncio.create_task(self.outbox_publisher.start())
        logger.info("Starting YouTube enrichment loop", extra={"event": "service_loop_started"})

        while self.running:
            try:
                video = self.consumer.fetch_one()
                if not video:
                    await asyncio.sleep(1)
                    continue

                success, terminal_failure = await self.process_video(video)
                if success:
                    self.consumer.commit()
                    logger.info(
                        "Processed and committed youtube video",
                        extra={"event": "video_committed", "data_point_id": video.data_point_id, "video_id": video.video_id},
                    )
                elif terminal_failure:
                    self.consumer.commit()
                    logger.warning(
                        "Committed terminally failed youtube video",
                        extra={"event": "video_terminally_failed_committed", "data_point_id": video.data_point_id, "video_id": video.video_id},
                    )
                else:
                    logger.warning(
                        "Processing failed, offset not committed",
                        extra={"event": "video_not_committed", "data_point_id": video.data_point_id, "video_id": video.video_id},
                    )

            except Exception as exc:
                logger.error("Error in YouTube enrichment loop", extra={"event": "service_loop_error", "error": str(exc)})
                await asyncio.sleep(5)

    def shutdown(self):
        logger.info("Shutting down YouTube enricher", extra={"event": "service_shutdown_started"})
        self.running = False
        self.outbox_publisher.stop()
        self.outbox_publisher.close()
        self.consumer.close()
        self.postgres.close()
        self.opensearch.close()
        self.mega_opensearch.close()
        logger.info("Shutdown complete", extra={"event": "service_shutdown_completed"})


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
