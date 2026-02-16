import logging
from typing import Iterable, Optional

from youtube_transcript_api import YouTubeTranscriptApi

logger = logging.getLogger(__name__)


class TranscriptFetcher:
    def __init__(self, languages: Optional[list[str]] = None):
        self.languages = languages or ["en", "en-US"]

    @staticmethod
    def _normalize_transcript_items(items: Iterable) -> str:
        parts: list[str] = []
        for item in items:
            if isinstance(item, dict):
                text = (item.get("text") or "").strip()
            else:
                text = (getattr(item, "text", "") or "").strip()
            if text:
                parts.append(text)
        return " ".join(parts).strip()

    def fetch(self, video_id: str) -> Optional[str]:
        try:
            transcript_text = self._fetch_with_compatible_api(video_id)
        except Exception as exc:
            logger.warning("Transcript fetch failed for %s: %s", video_id, exc)
            return None

        if not transcript_text:
            return None

        if len(transcript_text) < 20:
            return None

        return transcript_text

    def _fetch_with_compatible_api(self, video_id: str) -> str:
        # Legacy interface (<1.x): classmethod get_transcript(...)
        get_transcript = getattr(YouTubeTranscriptApi, "get_transcript", None)
        if callable(get_transcript):
            items = get_transcript(video_id, languages=self.languages)
            return self._normalize_transcript_items(items)

        # Newer interface (>=1.x): instance methods (fetch/list)
        api = YouTubeTranscriptApi()

        fetch = getattr(api, "fetch", None)
        if callable(fetch):
            fetched = fetch(video_id, languages=self.languages)
            if hasattr(fetched, "to_raw_data"):
                return self._normalize_transcript_items(fetched.to_raw_data())
            return self._normalize_transcript_items(fetched)

        list_transcripts = getattr(api, "list", None)
        if callable(list_transcripts):
            transcript_list = list_transcripts(video_id)
            transcript_obj = None

            find_transcript = getattr(transcript_list, "find_transcript", None)
            if callable(find_transcript):
                try:
                    transcript_obj = find_transcript(self.languages)
                except Exception:
                    transcript_obj = None

            if transcript_obj is None:
                find_generated = getattr(transcript_list, "find_generated_transcript", None)
                if callable(find_generated):
                    try:
                        transcript_obj = find_generated(self.languages)
                    except Exception:
                        transcript_obj = None

            if transcript_obj is not None:
                fetch_transcript = getattr(transcript_obj, "fetch", None)
                if callable(fetch_transcript):
                    fetched = fetch_transcript()
                    if hasattr(fetched, "to_raw_data"):
                        return self._normalize_transcript_items(fetched.to_raw_data())
                    return self._normalize_transcript_items(fetched)

        raise RuntimeError("Unsupported youtube-transcript-api interface")
