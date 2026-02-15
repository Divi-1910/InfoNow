import asyncio
import json
import logging
from datetime import datetime
from typing import List, Optional
import psycopg2

from .storage.opensearch import OpenSearchStorage, MegaOpenSearchStorage
from .models import OpenSearchDocument, MegaDocument

logger = logging.getLogger(__name__)


class OutboxPublisher:
    """
    Polls the OutboxEvent table and indexes documents to OpenSearch.
    Implements the "polling publisher" pattern for the transactional outbox.
    Handles both NewsArticleEnriched (chunks → news_index) and
    NewsArticleEnrichedMega (full doc → mega_index upsert).
    """

    def __init__(
        self,
        database_url: str,
        opensearch: OpenSearchStorage,
        mega_opensearch: MegaOpenSearchStorage,
        poll_interval: float = 1.0,
        batch_size: int = 100,
        max_retries: int = 3,
    ):
        self.database_url = database_url
        self.opensearch = opensearch
        self.mega_opensearch = mega_opensearch
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self.max_retries = max_retries
        self.conn = None
        self.running = False

    def connect(self):
        """Establish database connection"""
        self.conn = psycopg2.connect(self.database_url)
        logger.info("Outbox publisher connected to PostgreSQL")

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Outbox publisher closed PostgreSQL connection")

    async def start(self):
        """Start the background polling loop"""
        self.running = True
        logger.info(
            f"Outbox publisher started (interval={self.poll_interval}s, batch={self.batch_size})"
        )

        while self.running:
            try:
                processed = await self.process_batch()
                if processed > 0:
                    logger.info(f"Outbox publisher processed {processed} events")
            except Exception as e:
                logger.error(f"Outbox publisher error: {e}")
                try:
                    self.conn.rollback()
                except Exception:
                    pass

            await asyncio.sleep(self.poll_interval)

    def stop(self):
        """Stop the polling loop"""
        self.running = False
        logger.info("Outbox publisher stopping...")

    async def process_batch(self) -> int:
        """
        Fetch unprocessed events and index them to OpenSearch.
        Handles NewsArticleEnriched (chunks) and NewsArticleEnrichedMega (mega doc).
        Returns the number of events processed.

        The SELECT FOR UPDATE SKIP LOCKED and the UPDATE (mark processed/failed)
        are executed within a single transaction so row locks are held until commit,
        preventing duplicate processing when multiple replicas run concurrently.
        """
        processed_count = 0
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, "aggregateId", "eventType", topic, payload
                FROM "OutboxEvent"
                WHERE processed = false
                  AND "retryCount" < %s
                  AND "eventType" IN ('NewsArticleEnriched', 'NewsArticleEnrichedMega')
                ORDER BY "createdAt"
                FOR UPDATE SKIP LOCKED
                LIMIT %s
                """,
                (self.max_retries, self.batch_size),
            )
            rows = cur.fetchall()

            for row in rows:
                event_id, aggregate_id, event_type, topic, payload = row
                payload_dict = json.loads(payload) if isinstance(payload, str) else payload

                if event_type == "NewsArticleEnriched":
                    documents = [OpenSearchDocument(**doc) for doc in payload_dict["documents"]]
                    if self._index_to_opensearch(documents):
                        cur.execute(
                            'UPDATE "OutboxEvent" SET processed = true, "processedAt" = %s WHERE id = %s',
                            (datetime.utcnow(), event_id),
                        )
                        processed_count += 1
                    else:
                        cur.execute(
                            'UPDATE "OutboxEvent" SET "retryCount" = "retryCount" + 1, "lastError" = %s WHERE id = %s',
                            ("Failed to index chunks to OpenSearch", event_id),
                        )

                elif event_type == "NewsArticleEnrichedMega":
                    mega_doc = MegaDocument(**payload_dict)
                    if self._upsert_mega(mega_doc):
                        cur.execute(
                            'UPDATE "OutboxEvent" SET processed = true, "processedAt" = %s WHERE id = %s',
                            (datetime.utcnow(), event_id),
                        )
                        processed_count += 1
                    else:
                        cur.execute(
                            'UPDATE "OutboxEvent" SET "retryCount" = "retryCount" + 1, "lastError" = %s WHERE id = %s',
                            ("Failed to upsert to mega_index", event_id),
                        )

        self.conn.commit()
        return processed_count

    def _index_to_opensearch(self, documents: List[OpenSearchDocument]) -> bool:
        """Index chunk documents to news_index. Returns True on success."""
        try:
            self.opensearch.index_documents(documents)
            return True
        except Exception as e:
            logger.error(f"Failed to index chunks to OpenSearch: {e}")
            return False

    def _upsert_mega(self, doc: MegaDocument) -> bool:
        """Upsert a mega document to mega_index. Returns True on success."""
        try:
            self.mega_opensearch.upsert_document(doc)
            return True
        except Exception as e:
            logger.error(f"Failed to upsert mega doc: {e}")
            return False
