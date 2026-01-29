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
    """Document to be indexed in OpenSearch"""
    data_id: str
    data_point_id: str
    source_type: str = "news"
    topic: str
    subtopic: str
    title: str
    url: str
    source_name: Optional[str]
    published_at: datetime
    chunk_index: int
    content: str
    embedding: List[float]
