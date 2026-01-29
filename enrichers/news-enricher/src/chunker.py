import logging
from typing import List
import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .models import Chunk

logger = logging.getLogger(__name__)


class HybridChunker:
    """
    Hybrid chunking strategy that respects semantic boundaries
    while enforcing a maximum token limit.
    """

    def __init__(self, max_tokens: int = 512, chunk_overlap: int = 50):
        self.max_tokens = max_tokens
        self.chunk_overlap = chunk_overlap

        # Use cl100k_base encoding (same as GPT-4)
        self.encoding = tiktoken.get_encoding("cl100k_base")

        # Initialize the text splitter
        # Approximate chars per token is ~4, but we'll use token-based length
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=max_tokens,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""],
            length_function=self._count_tokens,
        )

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken"""
        return len(self.encoding.encode(text))

    def chunk(self, text: str) -> List[Chunk]:
        """
        Split text into chunks respecting semantic boundaries.
        Returns list of Chunk objects with index and token count.
        """
        if not text or not text.strip():
            return []

        try:
            # Split the text
            chunks_text = self.splitter.split_text(text)

            # Create Chunk objects
            chunks = []
            for i, content in enumerate(chunks_text):
                token_count = self._count_tokens(content)
                chunks.append(
                    Chunk(
                        index=i,
                        content=content,
                        token_count=token_count,
                    )
                )

            logger.debug(f"Created {len(chunks)} chunks from text of {len(text)} chars")
            return chunks

        except Exception as e:
            logger.error(f"Error chunking text: {e}")
            # Fallback: return whole text as single chunk if it's not too long
            token_count = self._count_tokens(text)
            if token_count <= self.max_tokens * 2:
                return [Chunk(index=0, content=text, token_count=token_count)]
            return []
