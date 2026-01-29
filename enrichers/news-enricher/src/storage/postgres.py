import logging
from datetime import datetime
from typing import List
import psycopg2
from psycopg2.extras import execute_values

from ..models import EnrichedArticle, Chunk

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

    def save_enriched_article(
        self,
        data_point_id: str,
        full_content: str,
        summary: str | None,
        chunks: List[Chunk],
        embeddings: List[List[float]],
    ) -> str:
        """
        Save enriched article and its chunks to the database.
        Returns the enriched article ID.
        """
        try:
            with self.conn.cursor() as cur:
                # Insert EnrichedNewsArticle
                cur.execute(
                    """
                    INSERT INTO "EnrichedNewsArticle" (id, "dataId", "fullContent", summary, "scrapedAt")
                    VALUES (gen_random_uuid(), %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (data_point_id, full_content, summary, datetime.utcnow()),
                )
                enriched_id = cur.fetchone()[0]

                # Insert NewsChunks
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
