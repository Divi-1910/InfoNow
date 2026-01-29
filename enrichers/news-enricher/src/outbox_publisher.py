import asyncio
import json
import logging
from datetime import datetime
from typing import List, Optional
import psycopg2

from .storage.opensearch import OpenSearchStorage
from .models import OpenSearchDocument

logger = logging.getLogger(__name__)


class OutboxPublisher:
    """
    Polls the OutboxEvent table and indexes documents to OpenSearch.
    Implements the "polling publisher" pattern for the transactional outbox.
    """

    def __init__(
        self,
        database_url: str,
        opensearch: OpenSearchStorage,
        poll_interval: float = 1.0,
        batch_size: int = 100,
        max_retries: int = 3,
    ):
        self.database_url = database_url
        self.opensearch = opensearch
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

            await asyncio.sleep(self.poll_interval)

    def stop(self):
        """Stop the polling loop"""
        self.running = False
        logger.info("Outbox publisher stopping...")

    async def process_batch(self) -> int:
        """
        Fetch unprocessed events and index them to OpenSearch.
        Returns the number of events processed.
        """
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, "aggregateId", topic, payload
                FROM "OutboxEvent"
                WHERE processed = false
                  AND "retryCount" < %s
                  AND "eventType" = 'NewsArticleEnriched'
                ORDER BY "createdAt"
                FOR UPDATE SKIP LOCKED
                LIMIT %s
                """,
                (self.max_retries, self.batch_size),
            )
            rows = cur.fetchall()

        events = []
        for row in rows:
            event_id, aggregate_id, topic, payload = row
            # Handle both string and dict (psycopg2 may auto-parse JSONB)
            payload_dict = json.loads(payload) if isinstance(payload, str) else payload
            documents = [OpenSearchDocument(**doc) for doc in payload_dict["documents"]]
            events.append((event_id, documents))

        processed_count = 0
        for event_id, documents in events:
            if self._index_to_opensearch(documents):
                self._mark_processed(event_id)
                processed_count += 1
            else:
                self._mark_failed(event_id, "Failed to index to OpenSearch")

        return processed_count

    def _mark_processed(self, event_id: str):
        """Mark an event as successfully processed"""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE "OutboxEvent"
                SET processed = true, "processedAt" = %s
                WHERE id = %s
                """,
                (datetime.utcnow(), event_id),
            )
        self.conn.commit()

    def _mark_failed(self, event_id: str, error: str):
        """Increment retry count and record the error"""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE "OutboxEvent"
                SET "retryCount" = "retryCount" + 1, "lastError" = %s
                WHERE id = %s
                """,
                (error, event_id),
            )
        self.conn.commit()

    def _index_to_opensearch(self, documents: List[OpenSearchDocument]) -> bool:
        """Index documents to OpenSearch. Returns True on success."""
        try:
            self.opensearch.index_documents(documents)
            return True
        except Exception as e:
            logger.error(f"Failed to index to OpenSearch: {e}")
            return False
