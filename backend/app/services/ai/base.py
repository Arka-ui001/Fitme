"""AI provider interfaces — the ONLY contract the rest of the backend sees.

Architecture rule (spec §21): API routes and services never import
OpenAI/Gemini/etc. They call these interfaces; a concrete provider is
resolved in app/services/ai/provider.py.

The default provider ("stub") is deterministic and requires NO API key —
so the entire backend (auth, DB, uploads, coach, evaluation) works offline.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, Field


class UserContext(BaseModel):
    """Everything a provider may need to ground its answer — precomputed
    deterministically by the fitness/nutrition engines. No DB access here."""
    name: str = "there"
    weight_current_kg: float | None = None
    weight_change_30d_kg: float | None = None
    protein_avg_7d: float | None = None
    calories_avg_7d: float | None = None
    protein_target_g: float | None = None
    calorie_target_kcal: float | None = None
    sessions_this_week: int | None = None
    sessions_target_week: int | None = None
    goal_type: str | None = None
    muscle_trends: list[dict] = Field(default_factory=list)
    memories: list[str] = Field(default_factory=list, description="Top-K persistent memories")


class PhotoAnalysisInput(BaseModel):
    photo_id: int
    photo_type: str
    captured_at: str
    bodyweight_kg: float | None = None
    notes: str | None = None
    previous_photos_count: int = 0
    previous_session_dates: list[str] = Field(default_factory=list)
    user: UserContext = Field(default_factory=UserContext)


class VideoAnalysisInput(BaseModel):
    video_id: int
    exercise: str | None = None
    duration_s: float | None = None
    notes: str | None = None
    user: UserContext = Field(default_factory=UserContext)


class CoachReply(BaseModel):
    text: str
    confidence: float | None = None                     # 0..1
    evidence: list[str] = Field(default_factory=list)
    data: list[str] = Field(default_factory=list)
    model_name: str = "stub"
    model_version: str = "0.0.0"


class AnalysisResult(BaseModel):
    """Structured analysis — stored verbatim in analysis_json. Never prose-only."""
    title: str
    summary: str
    analysis: str
    evidence: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)
    confidence: float | None = None
    model_name: str = "stub"
    model_version: str = "0.0.0"


class AIProvider(ABC):
    """Interface every AI provider implements. Methods are synchronous:
    FastAPI runs sync endpoints in its threadpool, which keeps blocking
    SDK calls safe. Wrap with anyio.to_thread if you prefer async later."""

    name: str = "abstract"
    version: str = "0.0.0"

    @abstractmethod
    def analyze_photo(self, payload: PhotoAnalysisInput) -> AnalysisResult: ...

    @abstractmethod
    def analyze_video(self, payload: VideoAnalysisInput) -> AnalysisResult: ...

    @abstractmethod
    def generate_coach_reply(self, *, message: str, history: list[dict],
                             context: UserContext) -> CoachReply: ...

    def summarize_conversation(self, messages: list[dict]) -> str:
        """Optional hook — default: simple extractive summary."""
        if not messages:
            return ""
        return f"Conversation covering {len(messages)} messages; last topic: {messages[-1]['content'][:120]}"
