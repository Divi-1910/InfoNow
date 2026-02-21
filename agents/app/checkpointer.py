from __future__ import annotations

from contextlib import AbstractAsyncContextManager

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from .config import settings


class PostgresCheckpointerManager:
    def __init__(self) -> None:
        self._ctx: AbstractAsyncContextManager[AsyncPostgresSaver] | None = None
        self._saver: AsyncPostgresSaver | None = None

    @property
    def saver(self) -> AsyncPostgresSaver | None:
        return self._saver

    async def start(self) -> AsyncPostgresSaver:
        ctx = AsyncPostgresSaver.from_conn_string(settings.database_url)
        saver = await ctx.__aenter__()
        await saver.setup()
        self._ctx = ctx
        self._saver = saver
        return saver

    async def close(self) -> None:
        if self._ctx is not None:
            await self._ctx.__aexit__(None, None, None)
            self._ctx = None
            self._saver = None
