import logging
from typing import List

import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .models import Chunk

logger = logging.getLogger(__name__)


class HybridChunker:
    def __init__(self, max_tokens: int = 512, chunk_overlap: int = 50):
        self.max_tokens = max_tokens
        self.encoding = tiktoken.get_encoding("cl100k_base")
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=max_tokens,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""],
            length_function=self._count_tokens,
        )

    def _count_tokens(self, text: str) -> int:
        return len(self.encoding.encode(text))

    def chunk(self, text: str) -> List[Chunk]:
        if not text or not text.strip():
            return []

        try:
            chunk_texts = self.splitter.split_text(text)
            chunks: List[Chunk] = []
            for idx, content in enumerate(chunk_texts):
                chunks.append(
                    Chunk(index=idx, content=content, token_count=self._count_tokens(content))
                )
            return chunks
        except Exception as exc:
            logger.error("Error chunking transcript: %s", exc)
            token_count = self._count_tokens(text)
            if token_count <= self.max_tokens * 2:
                return [Chunk(index=0, content=text, token_count=token_count)]
            return []
