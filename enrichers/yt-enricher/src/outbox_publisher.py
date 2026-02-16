import asyncio
import json
import logging
from datetime import datetime
from typing import List

import psycopg2

from .models import OpenSearchDocument, MegaDocument
from .storage.opensearch import OpenSearchStorage, MegaOpenSearchStorage

logger = logging.getLogger(__name__)


class OutboxPublisher:
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
        self.conn = psycopg2.connect(self.database_url)
        logger.info("Outbox publisher connected to PostgreSQL", extra={"event": "outbox_postgres_connected"})

    def close(self):
        if self.conn:
            self.conn.close()
            logger.info("Outbox publisher closed PostgreSQL connection", extra={"event": "outbox_postgres_closed"})

    def stop(self):
        self.running = False
        logger.info("Outbox publisher stopping", extra={"event": "outbox_publisher_stopping"})

    async def start(self):
        self.running = True
        logger.info(
            "Outbox publisher started",
            extra={
                "event": "outbox_publisher_started",
                "poll_interval_seconds": self.poll_interval,
                "batch_size": self.batch_size,
                "max_retries": self.max_retries,
            },
        )

        while self.running:
            try:
                processed = await self.process_batch()
                if processed > 0:
                    logger.info("Outbox batch processed", extra={"event": "outbox_batch_processed", "processed_count": processed})
            except Exception as exc:
                logger.error("Outbox publisher error", extra={"event": "outbox_batch_failed", "error": str(exc)})
                try:
                    self.conn.rollback()
                except Exception:
                    pass

            await asyncio.sleep(self.poll_interval)

    async def process_batch(self) -> int:
        """
        The SELECT FOR UPDATE SKIP LOCKED and the UPDATE (mark processed/failed)
        are executed within a single transaction so row locks are held until commit,
        preventing duplicate processing when multiple replicas run concurrently.
        """
        processed_count = 0
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, "eventType", payload
                FROM "OutboxEvent"
                WHERE processed = false
                  AND "retryCount" < %s
                  AND "eventType" IN ('YoutubeVideoEnriched', 'YoutubeVideoEnrichedMega')
                ORDER BY "createdAt"
                FOR UPDATE SKIP LOCKED
                LIMIT %s
                """,
                (self.max_retries, self.batch_size),
            )
            rows = cur.fetchall()
            if rows:
                logger.debug("Claimed outbox rows", extra={"event": "outbox_rows_claimed", "row_count": len(rows)})

            for row in rows:
                event_id, event_type, payload = row
                payload_dict = json.loads(payload) if isinstance(payload, str) else payload

                if event_type == "YoutubeVideoEnriched":
                    docs = [OpenSearchDocument(**doc) for doc in payload_dict["documents"]]
                    if self._index_to_opensearch(docs):
                        cur.execute(
                            'UPDATE "OutboxEvent" SET processed = true, "processedAt" = %s WHERE id = %s',
                            (datetime.utcnow(), event_id),
                        )
                        processed_count += 1
                        logger.debug(
                            "Processed YoutubeVideoEnriched outbox event",
                            extra={
                                "event": "outbox_event_processed",
                                "outbox_event_id": str(event_id),
                                "event_type": event_type,
                                "document_count": len(docs),
                            },
                        )
                    else:
                        cur.execute(
                            'UPDATE "OutboxEvent" SET "retryCount" = "retryCount" + 1, "lastError" = %s WHERE id = %s',
                            ("Failed to index youtube chunks", event_id),
                        )
                        logger.warning(
                            "Failed processing YoutubeVideoEnriched outbox event",
                            extra={"event": "outbox_event_failed", "outbox_event_id": str(event_id), "event_type": event_type},
                        )

                elif event_type == "YoutubeVideoEnrichedMega":
                    mega_doc = MegaDocument(**payload_dict)
                    if self._upsert_mega(mega_doc):
                        cur.execute(
                            'UPDATE "OutboxEvent" SET processed = true, "processedAt" = %s WHERE id = %s',
                            (datetime.utcnow(), event_id),
                        )
                        processed_count += 1
                        logger.debug(
                            "Processed YoutubeVideoEnrichedMega outbox event",
                            extra={
                                "event": "outbox_event_processed",
                                "outbox_event_id": str(event_id),
                                "event_type": event_type,
                                "data_point_id": mega_doc.data_point_id,
                            },
                        )
                    else:
                        cur.execute(
                            'UPDATE "OutboxEvent" SET "retryCount" = "retryCount" + 1, "lastError" = %s WHERE id = %s',
                            ("Failed to upsert to mega_index", event_id),
                        )
                        logger.warning(
                            "Failed processing YoutubeVideoEnrichedMega outbox event",
                            extra={"event": "outbox_event_failed", "outbox_event_id": str(event_id), "event_type": event_type},
                        )

        self.conn.commit()
        return processed_count

    def _index_to_opensearch(self, docs: List[OpenSearchDocument]) -> bool:
        try:
            self.opensearch.index_documents(docs)
            return True
        except Exception as exc:
            logger.error(
                "Failed indexing youtube chunks",
                extra={"event": "outbox_chunk_index_failed", "document_count": len(docs), "error": str(exc)},
            )
            return False

    def _upsert_mega(self, doc: MegaDocument) -> bool:
        try:
            self.mega_opensearch.upsert_document(doc)
            return True
        except Exception as exc:
            logger.error(
                "Failed to upsert mega doc",
                extra={"event": "outbox_mega_upsert_failed", "data_point_id": doc.data_point_id, "error": str(exc)},
            )
            return False
