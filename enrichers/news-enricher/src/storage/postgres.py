import json
import logging
import uuid
from datetime import datetime
from typing import List, Optional, Tuple
import psycopg2
from psycopg2.extras import execute_values

from ..models import EnrichedArticle, Chunk, OpenSearchDocument, MegaDocument

logger = logging.getLogger(__name__)


class PostgresStorage:
    """PostgreSQL storage for enriched articles and chunks"""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.conn = None

    def connect(self):
        """Establish database connection"""
        self.conn = psycopg2.connect(self.database_url)
        logger.info("Connected to PostgreSQL")

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Closed PostgreSQL connection")

    def get_topic_by_slug(
        self, topic_slug: str, subtopic_slug: str
    ) -> Tuple[Optional[int], str, Optional[int], str]:
        """
        Look up topic and subtopic IDs/names by slug.
        Returns (topic_id, topic_name, subtopic_id, subtopic_name).
        """
        topic_id: Optional[int] = None
        topic_name: str = ""
        subtopic_id: Optional[int] = None
        subtopic_name: str = ""

        try:
            with self.conn.cursor() as cur:
                if topic_slug:
                    cur.execute(
                        'SELECT id, name FROM "Topic" WHERE slug = %s',
                        (topic_slug,),
                    )
                    row = cur.fetchone()
                    if row:
                        topic_id, topic_name = row[0], row[1]

                if subtopic_slug:
                    cur.execute(
                        'SELECT id, name FROM "SubTopic" WHERE slug = %s',
                        (subtopic_slug,),
                    )
                    row = cur.fetchone()
                    if row:
                        subtopic_id, subtopic_name = row[0], row[1]
        except Exception as e:
            logger.warning(f"Failed to look up topic slugs: {e}")

        return topic_id, topic_name, subtopic_id, subtopic_name

    def save_enriched_article(
        self,
        data_point_id: str,
        full_content: str,
        summary: str | None,
        chunks: List[Chunk],
        embeddings: List[List[float]],
        opensearch_documents: Optional[List[OpenSearchDocument]] = None,
        opensearch_index: Optional[str] = None,
        mega_document: Optional[MegaDocument] = None,
    ) -> str:
        """
        Save enriched article, chunks, and outbox events in a single transaction.
        Returns the enriched article ID.

        Emits:
        - NewsArticleEnriched OutboxEvent (chunks → news_index)
        - NewsArticleEnrichedMega OutboxEvent (mega doc → mega_index upsert)
        """
        try:
            with self.conn.cursor() as cur:
                # 1. Insert EnrichedNewsArticle
                cur.execute(
                    """
                    INSERT INTO "EnrichedNewsArticle" (id, "dataId", "fullContent", summary, "scrapedAt")
                    VALUES (gen_random_uuid(), %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (data_point_id, full_content, summary, datetime.utcnow()),
                )
                enriched_id = cur.fetchone()[0]

                # 2. Insert NewsChunks
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
                        INSERT INTO "NewsChunk" (id, "enrichedArticleId", "chunkIndex", content, embedding, "tokenCount")
                        VALUES %s
                        """,
                        chunk_data,
                        template="(gen_random_uuid(), %s, %s, %s, %s, %s)",
                    )

                # 3. OutboxEvent for news_index chunk indexing
                if opensearch_documents and opensearch_index:
                    payload = {
                        "documents": [doc.model_dump(mode="json") for doc in opensearch_documents]
                    }
                    cur.execute(
                        """
                        INSERT INTO "OutboxEvent"
                        (id, "aggregateType", "aggregateId", "eventType", topic, payload, processed, "retryCount", "maxRetries", "createdAt")
                        VALUES (%s, 'enriched_news', %s, 'NewsArticleEnriched', %s, %s, false, 0, 3, NOW())
                        """,
                        (str(uuid.uuid4()), data_point_id, opensearch_index, json.dumps(payload)),
                    )
                    logger.debug(f"Created outbox event for {len(opensearch_documents)} chunk documents")

                # 4. OutboxEvent for mega_index upsert
                if mega_document is not None:
                    mega_payload = mega_document.model_dump(mode="json")
                    cur.execute(
                        """
                        INSERT INTO "OutboxEvent"
                        (id, "aggregateType", "aggregateId", "eventType", topic, payload, processed, "retryCount", "maxRetries", "createdAt")
                        VALUES (%s, 'enriched_news', %s, 'NewsArticleEnrichedMega', 'mega_index', %s, false, 0, 3, NOW())
                        """,
                        (str(uuid.uuid4()), data_point_id, json.dumps(mega_payload)),
                    )
                    logger.debug(f"Created mega outbox event for data_point_id={data_point_id}")

                # 5. Commit all writes atomically
                self.conn.commit()
                logger.debug(f"Saved enriched article {enriched_id} with {len(chunks)} chunks")
                return enriched_id

        except Exception as e:
            self.conn.rollback()
            logger.error(f"Error saving enriched article: {e}")
            raise

    def check_already_enriched(self, data_point_id: str) -> bool:
        """Check if a DataPoint has already been enriched"""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM "EnrichedNewsArticle" WHERE "dataId" = %s
                    )
                    """,
                    (data_point_id,),
                )
                return cur.fetchone()[0]
        except Exception as e:
            logger.error(f"Error checking enrichment status: {e}")
            return False
