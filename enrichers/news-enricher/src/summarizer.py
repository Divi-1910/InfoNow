import logging
from typing import Optional

import ollama

logger = logging.getLogger(__name__)


class OllamaSummarizer:
    """Ollama client for generating concise summaries."""

    def __init__(self, model: str = "llama3.2", host: str = "http://localhost:11434"):
        self.model = model
        self.client = ollama.Client(host=host)
        logger.info("Initialized Ollama summarizer with model: %s", model)

    def summarize(self, title: str, content: str, max_input_chars: int = 12000) -> Optional[str]:
        if not content:
            return None

        trimmed = content.strip()
        if not trimmed:
            return None

        prompt = (
            "Summarize the following news article for a general audience.\n"
            "Rules:\n"
            "- Return plain text only.\n"
            "- Keep it factual and concise (4-7 sentences).\n"
            "- Include key claims, entities, and outcomes.\n"
            "- Do not add information not present in the article.\n\n"
            f"Title: {title}\n\n"
            "Article:\n"
            f"{trimmed[:max_input_chars]}"
        )

        try:
            response = self.client.generate(
                model=self.model,
                prompt=prompt,
                options={"temperature": 0.2},
            )
            summary = (response.get("response") or "").strip()
            return summary or None
        except Exception as exc:
            logger.error("Summary generation failed: %s", exc)
            return None
