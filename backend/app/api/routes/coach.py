"""Coach routes — conversations and grounded chat."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import ok
from app.schemas.coach import ChatRequest
from app.services.coach_service import CoachService
from app.services.rate_limit import chat_limit

router = APIRouter(prefix="/coach", tags=["coach"])


@router.post("/chat")
def chat(payload: ChatRequest, request: Request,
         current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat_limit(request)
    result = CoachService(db).chat(user=current_user, message=payload.message,
                                   conversation_id=payload.conversation_id)
    return ok({
        "conversation_id": result["conversation_id"],
        "reply": {
            "id": result["reply"].id, "role": result["reply"].role,
            "content": result["reply"].content, "created_at": result["reply"].created_at.isoformat(),
        },
        "evidence": result["evidence"],
        "confidence": result["confidence"],
    })


@router.get("/conversations")
def conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok({"items": CoachService(db).list_conversations(current_user)})


@router.get("/conversations/{conversation_id}")
def conversation_detail(conversation_id: int,
                        current_user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    detail = CoachService(db).conversation_detail(current_user, conversation_id)
    detail = {**detail, "messages": [{
        "id": m.id, "role": m.role, "content": m.content,
        "token_count": m.token_count, "context_json": m.context_json,
        "created_at": m.created_at.isoformat(),
    } for m in detail["messages"]],
        "updated_at": detail["updated_at"].isoformat() if detail["updated_at"] else None}
    return ok(detail)
