import asyncio
import json
import logging
from datetime import datetime
from typing import List

import psycopg2

from .models import OpenSearchDocument
from .storage.opensearch import OpenSearchStorage

logger = logging.getLogger(__name__)


class OutboxPublisher:
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
        self.conn = psycopg2.connect(self.database_url)
        logger.info("Outbox publisher connected to PostgreSQL")

    def close(self):
        if self.conn:
            self.conn.close()
            logger.info("Outbox publisher closed PostgreSQL connection")

    def stop(self):
        self.running = False

    async def start(self):
        self.running = True
        logger.info(
            "Outbox publisher started (interval=%ss, batch=%d)",
            self.poll_interval,
            self.batch_size,
        )

        while self.running:
            try:
                processed = await self.process_batch()
                if processed > 0:
                    logger.info("Outbox publisher processed %d events", processed)
            except Exception as exc:
                logger.error("Outbox publisher error: %s", exc)

            await asyncio.sleep(self.poll_interval)

    async def process_batch(self) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, payload
                FROM "OutboxEvent"
                WHERE processed = false
                  AND "retryCount" < %s
                  AND "eventType" = 'YoutubeVideoEnriched'
                ORDER BY "createdAt"
                FOR UPDATE SKIP LOCKED
                LIMIT %s
                """,
                (self.max_retries, self.batch_size),
            )
            rows = cur.fetchall()

        events: list[tuple[str, List[OpenSearchDocument]]] = []
        for row in rows:
            event_id, payload = row
            payload_dict = json.loads(payload) if isinstance(payload, str) else payload
            docs = [OpenSearchDocument(**doc) for doc in payload_dict["documents"]]
            events.append((event_id, docs))

        processed_count = 0
        for event_id, docs in events:
            if self._index_to_opensearch(docs):
                self._mark_processed(event_id)
                processed_count += 1
            else:
                self._mark_failed(event_id, "Failed to index youtube docs")

        return processed_count

    def _index_to_opensearch(self, docs: List[OpenSearchDocument]) -> bool:
        try:
            self.opensearch.index_documents(docs)
            return True
        except Exception as exc:
            logger.error("Failed indexing youtube docs: %s", exc)
            return False

    def _mark_processed(self, event_id: str):
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
