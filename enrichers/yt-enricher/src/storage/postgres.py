import json
import logging
import uuid
from datetime import datetime
from typing import List, Optional

import psycopg2
from psycopg2.extras import execute_values

from ..models import Chunk, OpenSearchDocument

logger = logging.getLogger(__name__)


class PostgresStorage:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.conn = None

    def connect(self):
        self.conn = psycopg2.connect(self.database_url)
        logger.info("Connected to PostgreSQL")

    def close(self):
        if self.conn:
            self.conn.close()
            logger.info("Closed PostgreSQL connection")

    def check_already_enriched(self, data_point_id: str) -> bool:
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM "EnrichedYoutubeVideo" WHERE "dataId" = %s
                    )
                    """,
                    (data_point_id,),
                )
                return cur.fetchone()[0]
        except Exception as exc:
            logger.error("Error checking youtube enrichment status: %s", exc)
            return False

    def save_enriched_video(
        self,
        data_point_id: str,
        transcript: str,
        summary: str | None,
        chunks: List[Chunk],
        embeddings: List[List[float]],
        opensearch_documents: Optional[List[OpenSearchDocument]] = None,
        opensearch_index: Optional[str] = None,
    ) -> str:
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO "EnrichedYoutubeVideo" (id, "dataId", transcript, summary, "transcribedAt")
                    VALUES (gen_random_uuid(), %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (data_point_id, transcript, summary, datetime.utcnow()),
                )
                enriched_id = cur.fetchone()[0]

                if chunks and embeddings:
                    chunk_data = [
                        (
                            enriched_id,
                            chunk.index,
                            chunk.content,
                            embeddings[i] if i < len(embeddings) else [],
                            chunk.token_count,
                        )
                        for i, chunk in enumerate(chunks)
                    ]

                    execute_values(
                        cur,
                        """
                        INSERT INTO "YoutubeTranscriptChunk" (id, "enrichedVideoId", "chunkIndex", content, embedding, "tokenCount")
                        VALUES %s
                        """,
                        chunk_data,
                        template="(gen_random_uuid(), %s, %s, %s, %s, %s)",
                    )

                if opensearch_documents and opensearch_index:
                    payload = {
                        "documents": [doc.model_dump(mode="json") for doc in opensearch_documents]
                    }
                    cur.execute(
                        """
                        INSERT INTO "OutboxEvent"
                        (id, "aggregateType", "aggregateId", "eventType", topic, payload, processed, "retryCount", "maxRetries", "createdAt")
                        VALUES (%s, 'enriched_youtube', %s, 'YoutubeVideoEnriched', %s, %s, false, 0, 3, NOW())
                        """,
                        (str(uuid.uuid4()), data_point_id, opensearch_index, json.dumps(payload)),
                    )

                self.conn.commit()
                return enriched_id

        except Exception as exc:
            self.conn.rollback()
            logger.error("Error saving enriched youtube video: %s", exc)
            raise
