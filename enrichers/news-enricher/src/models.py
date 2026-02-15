from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class CleanNewsPoint(BaseModel):
    """Input model from process.news.clean topic"""
    id: str
    topic: str
    subtopic: str = ""
    fetch_timestamp: datetime
    content_hash: str
    title: str
    url: str
    description: Optional[str] = None
    published_at: datetime
    source_name: Optional[str] = None
    author: Optional[str] = None
    image_url: Optional[str] = None
    data_point_id: str


class Chunk(BaseModel):
    """A chunk of text with metadata"""
    index: int
    content: str
    token_count: int


class EnrichedArticle(BaseModel):
    """Fully enriched article ready for storage"""
    data_point_id: str
    full_content: str
    summary: Optional[str] = None
    chunks: List[Chunk]
    embeddings: List[List[float]]
    scraped_at: datetime


class OpenSearchDocument(BaseModel):
    """Per-chunk document indexed to news_index (BM25 + kNN hybrid search)"""
    data_id: str
    data_point_id: str
    source_type: str = "news"
    topic_id: Optional[int] = None
    topic_name: str = ""
    topic_slug: str = ""
    subtopic_id: Optional[int] = None
    subtopic_name: str = ""
    subtopic_slug: str = ""
    title: str
    description: Optional[str] = None
    url: str
    source_name: Optional[str] = None
    author: Optional[str] = None
    image_url: Optional[str] = None
    published_at: datetime
    fetch_timestamp: Optional[datetime] = None
    summary: Optional[str] = None
    chunk_index: int
    content: str
    embedding: List[float]


class MegaDocument(BaseModel):
    """Single feed document per DataPoint indexed to mega_index (no embeddings)"""
    data_point_id: str
    source_type: str = "news"
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
    url: Optional[str] = None
    source_name: Optional[str] = None
    author: Optional[str] = None
    image_url: Optional[str] = None
