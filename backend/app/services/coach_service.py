"""Coach orchestration: bounded context (memories + last N messages) →
provider reply → persisted conversation. No provider SDKs here (spec §21)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models.ai import Conversation, Message
from app.models.user import User
from app.repositories.ai_repo import ConversationRepository, MessageRepository
from app.services.ai.base import UserContext
from app.services.ai.provider import get_provider
from app.services.memory_service import MemoryService

CONTEXT_WINDOW = 12          # last messages sent to the provider
AUTO_SUMMARY_EVERY = 16      # summarize after this many messages


class CoachService:
    def __init__(self, db: Session):
        self.db = db
        self.conversations = ConversationRepository(db)
        self.messages = MessageRepository(db)
        self.memory = MemoryService(db)

    # ---------------- context building ----------------
    def build_user_context(self, user: User) -> UserContext:
        """Deterministic grounding facts for the provider (fitness/nutrition engines)."""
        from app.services.dashboard_service import DashboardService
        ctx = UserContext(name=user.name)
        try:
            snapshot = DashboardService(self.db).snapshot(user)
        except Exception:
            return self.memory.enrich_context(ctx, user.id)

        w = snapshot.get("weight") or {}
        n = snapshot.get("nutrition") or {}
        t = snapshot.get("training") or {}
        goals = (n.get("targets") or {})
        ctx.weight_current_kg = w.get("current_kg")
        ctx.weight_change_30d_kg = w.get("change_30d_kg")
        ctx.protein_avg_7d = (n.get("averages_7d") or {}).get("protein")
        ctx.calories_avg_7d = (n.get("averages_7d") or {}).get("calories")
        ctx.protein_target_g = goals.get("protein")
        ctx.calorie_target_kcal = goals.get("calories")
        ctx.sessions_this_week = t.get("sessions_this_week")
        ctx.sessions_target_week = t.get("target_per_week")
        ctx.goal_type = snapshot.get("goal_type")
        ctx.muscle_trends = snapshot.get("muscle_trends") or []
        return self.memory.enrich_context(ctx, user.id)

    # ---------------- conversation helpers ----------------
    def _get_conversation(self, user: User, conversation_id: int | None, first_message: str) -> Conversation:
        if conversation_id is None:
            title = first_message.strip()[:60] + ("…" if len(first_message.strip()) > 60 else "")
            return self.conversations.create(user_id=user.id, title=title)
        conv = self.conversations.get_for_user(conversation_id, user.id)
        if conv is None:
            raise NotFoundError("conversation_not_found", f"No conversation #{conversation_id}.")
        return conv

    def _maybe_summarize(self, conv: Conversation) -> None:
        count = len(conv.messages)
        if count and count % AUTO_SUMMARY_EVERY == 0:
            provider = get_provider()
            rows = [{"role": m.role, "content": m.content} for m in conv.messages[-30:]]
            conv.summary = provider.summarize_conversation(rows)

    # ---------------- public API ----------------
    def chat(self, *, user: User, message: str, conversation_id: int | None = None) -> dict:
        if not message.strip():
            raise AppError("validation_error", "Message must not be empty.")

        conv = self._get_conversation(user, conversation_id, message)
        user_context = self.build_user_context(user)
        history_rows = self.messages.recent(conv.id, limit=CONTEXT_WINDOW)
        history = [{"role": m.role, "content": m.content} for m in history_rows]

        # persist the user message first
        self.messages.create(
            conversation_id=conv.id, role="user", content=message.strip(),
            token_count=max(1, len(message) // 4),
        )

        provider = get_provider()
        reply = provider.generate_coach_reply(message=message.strip(), history=history, context=user_context)

        assistant = self.messages.create(
            conversation_id=conv.id, role="assistant", content=reply.text,
            token_count=max(1, len(reply.text) // 4),
            context_json={
                "evidence": reply.evidence, "data": reply.data, "confidence": reply.confidence,
                "model_name": reply.model_name, "model_version": reply.model_version,
                "memories_used": user_context.memories,
            },
        )
        conv.updated_at = assistant.created_at or conv.updated_at
        self._maybe_summarize(conv)
        self.db.commit()
        return {
            "conversation_id": conv.id,
            "reply": assistant,
            "evidence": reply.evidence,
            "confidence": reply.confidence,
        }

    def list_conversations(self, user: User) -> list[dict]:
        return self.conversations.list_for_user(user.id)

    def conversation_detail(self, user: User, conversation_id: int) -> dict:
        conv = self.conversations.get_for_user(conversation_id, user.id)
        if conv is None:
            raise NotFoundError("conversation_not_found", f"No conversation #{conversation_id}.")
        return {
            "id": conv.id, "title": conv.title, "summary": conv.summary,
            "message_count": len(conv.messages), "last_message": conv.messages[-1].content[:120] if conv.messages else None,
            "updated_at": conv.updated_at, "messages": conv.messages,
        }
