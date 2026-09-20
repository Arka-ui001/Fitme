"""Coach chat schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = Field(default=None, description="Omit to start a new conversation.")


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    token_count: int | None
    context_json: dict | None
    created_at: datetime


class ConversationOut(BaseModel):
    id: int
    title: str
    summary: str | None = None
    message_count: int = 0
    last_message: str | None = None
    updated_at: datetime | None = None


class ConversationDetail(ConversationOut):
    messages: list[MessageOut] = []


class ChatResponse(BaseModel):
    conversation_id: int
    reply: MessageOut
    evidence: list[str] = []
    confidence: float | None = None
