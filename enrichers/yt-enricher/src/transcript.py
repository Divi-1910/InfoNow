import logging
from typing import Optional

from youtube_transcript_api import YouTubeTranscriptApi

logger = logging.getLogger(__name__)


class TranscriptFetcher:
    def fetch(self, video_id: str) -> Optional[str]:
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
        except Exception as exc:
            logger.warning("Transcript fetch failed for %s: %s", video_id, exc)
            return None

        if not transcript:
            return None

        text = " ".join((item.get("text") or "").strip() for item in transcript).strip()
        if len(text) < 20:
            return None

        return text
