import logging
from typing import List
import ollama

logger = logging.getLogger(__name__)


class OllamaEmbedder:
    """Ollama client for generating text embeddings"""

    def __init__(self, model: str = "nomic-embed-text", host: str = "http://localhost:11434"):
        self.model = model
        self.client = ollama.Client(host=host)
        logger.info(f"Initialized Ollama embedder with model: {model}")

    def embed(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        try:
            response = self.client.embeddings(model=self.model, prompt=text)
            return response["embedding"]
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        Note: Ollama doesn't support native batching, so we process sequentially.
        For better performance, consider running multiple Ollama instances.
        """
        embeddings = []
        for i, text in enumerate(texts):
            try:
                embedding = self.embed(text)
                embeddings.append(embedding)
                if (i + 1) % 10 == 0:
                    logger.debug(f"Generated {i + 1}/{len(texts)} embeddings")
            except Exception as e:
                logger.error(f"Failed to embed text {i}: {e}")
                # Return empty embedding as placeholder
                embeddings.append([])

        return embeddings

    def get_dimension(self) -> int:
        """Get the embedding dimension by generating a test embedding"""
        try:
            test_embedding = self.embed("test")
            return len(test_embedding)
        except Exception as e:
            logger.error(f"Could not determine embedding dimension: {e}")
            return 768  # Default for nomic-embed-text
