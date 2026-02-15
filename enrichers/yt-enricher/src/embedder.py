import logging
from typing import List

import ollama

logger = logging.getLogger(__name__)


class OllamaEmbedder:
    def __init__(self, model: str = "nomic-embed-text", host: str = "http://localhost:11434"):
        self.model = model
        self.client = ollama.Client(host=host)
        logger.info("Initialized Ollama embedder with model: %s", model)

    def embed(self, text: str) -> List[float]:
        response = self.client.embeddings(model=self.model, prompt=text)
        return response["embedding"]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        embeddings: List[List[float]] = []
        for idx, text in enumerate(texts):
            try:
                embeddings.append(self.embed(text))
                if (idx + 1) % 10 == 0:
                    logger.debug("Generated %d/%d embeddings", idx + 1, len(texts))
            except Exception as exc:
                logger.error("Failed embedding at index %d: %s", idx, exc)
                embeddings.append([])
        return embeddings
