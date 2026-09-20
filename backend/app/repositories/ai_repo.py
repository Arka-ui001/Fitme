"""AI-layer repositories: conversations, messages, memories, reports, evaluations, videos."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.ai import AIEvaluation, AIReport, Conversation, Memory, Message
from app.models.video import ExerciseVideo, VideoAnalysis
from app.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):
    model = Conversation

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_user(self, conversation_id: int, user_id: int) -> Conversation | None:
        return self.db.scalar(select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id))

    def list_for_user(self, user_id: int) -> list[dict]:
        convs = self.db.scalars(select(Conversation).where(Conversation.user_id == user_id)
                                .order_by(Conversation.updated_at.desc())).all()
        out = []
        for c in convs:
            count = self.db.scalar(select(func.count(Message.id)).where(Message.conversation_id == c.id)) or 0
            last = self.db.scalar(select(Message).where(Message.conversation_id == c.id)
                                  .order_by(Message.id.desc()).limit(1))
            out.append({
                "id": c.id, "title": c.title, "summary": c.summary,
                "message_count": int(count),
                "last_message": (last.content[:120] if last else None),
                "updated_at": c.updated_at,
            })
        return out


class MessageRepository(BaseRepository[Message]):
    model = Message

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def recent(self, conversation_id: int, limit: int = 12) -> list[Message]:
        """Last `limit` messages in chronological order (bounded context window)."""
        rows = list(self.db.scalars(select(Message).where(Message.conversation_id == conversation_id)
                                    .order_by(Message.id.desc()).limit(limit)).all())
        return list(reversed(rows))


class MemoryRepository(BaseRepository[Memory]):
    model = Memory

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def top(self, user_id: int, limit: int = 8) -> list[Memory]:
        """Most important, most recent memories — this is what the coach reads."""
        stmt = select(Memory).where(Memory.user_id == user_id) \
            .order_by(Memory.importance.desc(), Memory.updated_at.desc()).limit(limit)
        return list(self.db.scalars(stmt).all())


class ReportRepository(BaseRepository[AIReport]):
    model = AIReport

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def latest(self, user_id: int, types: tuple[str, ...] | None = None) -> AIReport | None:
        stmt = select(AIReport).where(AIReport.user_id == user_id)
        if types:
            stmt = stmt.where(AIReport.report_type.in_(types))
        return self.db.scalar(stmt.order_by(AIReport.created_at.desc()).limit(1))

    def recent(self, user_id: int, limit: int = 5) -> list[AIReport]:
        stmt = select(AIReport).where(AIReport.user_id == user_id) \
            .order_by(AIReport.created_at.desc()).limit(limit)
        return list(self.db.scalars(stmt).all())


class EvaluationRepository(BaseRepository[AIEvaluation]):
    model = AIEvaluation

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_report(self, user_id: int, report_id: int) -> AIEvaluation | None:
        return self.db.scalar(select(AIEvaluation).where(
            AIEvaluation.user_id == user_id, AIEvaluation.report_id == report_id))


class VideoRepository(BaseRepository[ExerciseVideo]):
    model = ExerciseVideo

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_user(self, video_id: int, user_id: int) -> ExerciseVideo | None:
        return self.db.scalar(select(ExerciseVideo).where(
            ExerciseVideo.id == video_id, ExerciseVideo.user_id == user_id))


class VideoAnalysisRepository(BaseRepository[VideoAnalysis]):
    model = VideoAnalysis

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_user(self, analysis_id: int, user_id: int) -> VideoAnalysis | None:
        return self.db.scalar(
            select(VideoAnalysis)
            .join(ExerciseVideo, VideoAnalysis.video_id == ExerciseVideo.id)
            .where(VideoAnalysis.id == analysis_id, ExerciseVideo.user_id == user_id)
        )
