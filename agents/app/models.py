from typing import Any
from pydantic import BaseModel, Field


class AgentQueryRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str | None = None


class Citation(BaseModel):
    data_point_id: str
    title: str
    source_type: str
    score: float | None = None
    url: str | None = None
    snippet: str | None = None


class AgentQueryResponse(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    used_tools: list[str] = Field(default_factory=list)
    loops: int = 0
    debug: dict[str, Any] = Field(default_factory=dict)


class CreateThreadResponse(BaseModel):
    thread_id: str
    created_at: str
