"""AI-layer models: conversations, messages, persistent memory, reports, evaluations."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

MEMORY_CATEGORIES = (
    "profile", "preference", "goal", "training", "nutrition", "progress", "recommendation", "outcome",
)
MESSAGE_ROLES = ("user", "assistant", "system")
REPORT_TYPES = ("daily", "weekly", "monthly", "photo_analysis", "video_analysis", "nutrition", "training")
FEEDBACK_VALUES = ("correct", "partially_correct", "incorrect")


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="New conversation")
    summary: Mapped[str | None] = mapped_column(Text)     # rolling summary — avoids replaying full history

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.id"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(12), nullable=False)          # user | assistant | system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer)               # approximate (len/4) until a real tokenizer is wired
    context_json: Mapped[dict | None] = mapped_column(JSON)                # retrieved memories / evidence used for this reply
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class Memory(TimestampMixin, Base):
    """Persistent AI memory — the coach reads top-K memories, not the whole history."""
    __tablename__ = "memories"
    __table_args__ = (Index("ix_memories_user_importance", "user_id", "importance"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    importance: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)   # 0..1
    source: Mapped[str | None] = mapped_column(String(120))                # e.g. "chat", "evaluation", "seed"

    # created_at / updated_at from TimestampMixin


class AIReport(TimestampMixin, Base):
    """Generated insights (daily/weekly/...). content_json is STRUCTURED:
    {text, title?, evidence: [...], sources: [...], ...} — not only prose."""
    __tablename__ = "ai_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    report_type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)                # 0..1


class AIEvaluation(TimestampMixin, Base):
    """Human feedback on a generated report — one per (user, report)."""
    __tablename__ = "ai_evaluations"
    __table_args__ = (UniqueConstraint("user_id", "report_id", name="uq_eval_user_report"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    report_id: Mapped[int] = mapped_column(ForeignKey("ai_reports.id", ondelete="CASCADE"), index=True, nullable=False)
    feedback: Mapped[str] = mapped_column(String(30), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
