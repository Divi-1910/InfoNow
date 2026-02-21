from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import psycopg

from .config import settings


def ensure_thread_table() -> None:
    with psycopg.connect(settings.database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_threads (
                    thread_id TEXT PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )


def create_thread() -> tuple[str, datetime]:
    thread_id = str(uuid4())
    created_at = datetime.now(timezone.utc)
    with psycopg.connect(settings.database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO agent_threads (thread_id, created_at)
                VALUES (%s, %s)
                """,
                (thread_id, created_at),
            )
    return thread_id, created_at


def thread_exists(thread_id: str) -> bool:
    with psycopg.connect(settings.database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM agent_threads WHERE thread_id = %s", (thread_id,))
            return cur.fetchone() is not None

