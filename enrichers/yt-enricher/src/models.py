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
    """Per-chunk document indexed to yt_index (BM25 + kNN hybrid search)"""
    data_id: str
    data_point_id: str
    source_type: str = "youtube"
    topic_id: Optional[int] = None
    topic_name: str = ""
    topic_slug: str = ""
    subtopic_id: Optional[int] = None
    subtopic_name: str = ""
    subtopic_slug: str = ""
    title: str
    description: Optional[str] = None
    video_id: str
    channel_id: str
    channel_title: str
    thumbnail_url: Optional[str] = None
    published_at: datetime
    fetch_timestamp: Optional[datetime] = None
    duration: Optional[str] = None
    view_count: int = 0
    like_count: int = 0
    summary: Optional[str] = None
    chunk_index: int
    content: str
    embedding: List[float]


class MegaDocument(BaseModel):
    """Single feed document per DataPoint indexed to mega_index (no embeddings)"""
    data_point_id: str
    source_type: str = "youtube"
    fetch_timestamp: str
    topic_id: Optional[int] = None
    topic_name: str = ""
    topic_slug: str = ""
    subtopic_id: Optional[int] = None
    subtopic_name: str = ""
    subtopic_slug: str = ""
    title: str
    description: Optional[str] = None
    summary: Optional[str] = None
    has_enriched: bool = True
    published_at: str
    video_id: Optional[str] = None
    channel_id: Optional[str] = None
    channel_title: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[str] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
