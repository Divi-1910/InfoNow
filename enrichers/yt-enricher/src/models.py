from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class CleanYoutubePoint(BaseModel):
    id: str
    topic: str
    subtopic: str = ""
    fetch_timestamp: datetime
    content_hash: str
    video_id: str
    channel_id: str
    channel_title: str
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    published_at: datetime
    duration: Optional[str] = None
    view_count: int = 0
    like_count: int = 0
    data_point_id: str


class Chunk(BaseModel):
    index: int
    content: str
    token_count: int


class TranscriptResult(BaseModel):
    full_text: str


class OpenSearchDocument(BaseModel):
    data_id: str
    data_point_id: str
    source_type: str = "youtube"
    topic: str
    subtopic: str
    title: str
    video_id: str
    channel_id: str
    channel_title: str
    published_at: datetime
    chunk_index: int
    content: str
    embedding: List[float]
