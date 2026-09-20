import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.ai.base import (
    AIProvider,
    AnalysisResult,
    CoachReply,
    PhotoAnalysisInput,
    VideoAnalysisInput,
    UserContext,
)


class GeminiAnalysisResponse(BaseModel):
    """Clean structured schema without freeform dicts for Gemini Developer API."""
    title: str
    summary: str
    analysis: str
    evidence: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.85, ge=0.0, le=1.0)


class GeminiProvider(AIProvider):
    name = "gemini"
    version = "1.0.0"

    def __init__(self):
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is required to use the Gemini provider.")
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        model_name = settings.AI_MODEL_NAME or "gemini-1.5-flash"
        if model_name == "forge-rules":
            model_name = "gemini-1.5-flash"
        self.model = model_name
        self.fallback_model = "gemini-1.5-flash"
        self.version = settings.AI_MODEL_VERSION or "1.0.0"

    def _generate_content(self, prompt: str, schema: type[BaseModel]) -> str:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
        )
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config,
            )
            return response.text
        except Exception as e:
            # If 503 high demand or temporary outage occurs, attempt fallback model
            if self.model != self.fallback_model and ("503" in str(e) or "UNAVAILABLE" in str(e)):
                response = self.client.models.generate_content(
                    model=self.fallback_model,
                    contents=prompt,
                    config=config,
                )
                return response.text
            raise

    def _get_context_str(self, ctx: UserContext) -> str:
        parts = [f"User Name: {ctx.name}"]
        if ctx.weight_current_kg:
            parts.append(f"Current Bodyweight: {ctx.weight_current_kg} kg")
        if ctx.weight_change_30d_kg is not None:
            parts.append(f"30-day weight change: {ctx.weight_change_30d_kg:+} kg")
        if ctx.goal_type:
            parts.append(f"Primary Fitness Goal: {ctx.goal_type}")
        if ctx.protein_avg_7d is not None:
            target_str = f" (target: {ctx.protein_target_g}g)" if ctx.protein_target_g else ""
            parts.append(f"7-day average protein: {ctx.protein_avg_7d:.1f}g{target_str}")
        if ctx.calories_avg_7d is not None:
            target_str = f" (target: {ctx.calorie_target_kcal} kcal)" if ctx.calorie_target_kcal else ""
            parts.append(f"7-day average calories: {ctx.calories_avg_7d:.0f} kcal{target_str}")
        if ctx.sessions_this_week is not None:
            target_str = f" / {ctx.sessions_target_week}" if ctx.sessions_target_week else ""
            parts.append(f"Workout sessions this week: {ctx.sessions_this_week}{target_str}")
        if ctx.muscle_trends:
            trends_str = ", ".join(f"{m.get('muscle_group')}: {m.get('trend')}" for m in ctx.muscle_trends[:5])
            parts.append(f"Recent muscle trends: {trends_str}")
        if ctx.memories:
            parts.append("Memories / Coach Notes: " + "; ".join(ctx.memories))
        return "\n".join(parts)

    def analyze_photo(self, payload: PhotoAnalysisInput) -> AnalysisResult:
        context_str = self._get_context_str(payload.user)
        meta_lines = [
            f"Photo Type: {payload.photo_type}",
            f"Captured Date: {payload.captured_at}",
        ]
        if payload.bodyweight_kg:
            meta_lines.append(f"Bodyweight at capture: {payload.bodyweight_kg} kg")
        if payload.notes:
            meta_lines.append(f"User Notes: {payload.notes}")
        if payload.previous_photos_count:
            meta_lines.append(f"Previous photo sessions on record: {payload.previous_photos_count}")

        prompt = f"""You are ForgeAI's expert fitness, posture, and physique coach analyzing a progress photo submission.
User Context:
{context_str}

Submission Metadata:
{chr(10).join(meta_lines)}

Provide a thorough, encouraging, and structured fitness analysis. Ground your evidence and recommendations in the user's data and current goal."""

        raw_json = self._generate_content(prompt, GeminiAnalysisResponse)
        parsed = json.loads(raw_json)
        return AnalysisResult(
            title=parsed.get("title", f"{payload.photo_type.capitalize()} Photo Analysis"),
            summary=parsed.get("summary", ""),
            analysis=parsed.get("analysis", ""),
            evidence=parsed.get("evidence", []),
            limitations=parsed.get("limitations", []),
            recommendations=parsed.get("recommendations", []),
            metrics={
                "photo_type": payload.photo_type,
                "bodyweight_kg": payload.bodyweight_kg,
                "previous_photos_count": payload.previous_photos_count,
            },
            confidence=float(parsed.get("confidence", 0.85)),
            model_name=self.model,
            model_version=self.version,
        )

    def analyze_video(self, payload: VideoAnalysisInput) -> AnalysisResult:
        context_str = self._get_context_str(payload.user)
        meta_lines = [f"Exercise: {payload.exercise or 'Exercise session'}"]
        if payload.duration_s:
            meta_lines.append(f"Duration: {payload.duration_s:.1f}s")
        if payload.notes:
            meta_lines.append(f"User Notes: {payload.notes}")

        prompt = f"""You are ForgeAI's expert biomechanics and movement coach analyzing an exercise video.
User Context:
{context_str}

Video Information:
{chr(10).join(meta_lines)}

Provide a comprehensive, actionable, and structured movement assessment. Address form, tempo, safety, and progression points grounded in the exercise."""

        raw_json = self._generate_content(prompt, GeminiAnalysisResponse)
        parsed = json.loads(raw_json)
        return AnalysisResult(
            title=parsed.get("title", f"{payload.exercise or 'Movement'} Video Assessment"),
            summary=parsed.get("summary", ""),
            analysis=parsed.get("analysis", ""),
            evidence=parsed.get("evidence", []),
            limitations=parsed.get("limitations", []),
            recommendations=parsed.get("recommendations", []),
            metrics={
                "exercise": payload.exercise,
                "duration_s": payload.duration_s,
            },
            confidence=float(parsed.get("confidence", 0.85)),
            model_name=self.model,
            model_version=self.version,
        )

    def generate_coach_reply(
        self, *, message: str, history: list[dict], context: UserContext
    ) -> CoachReply:
        context_str = self._get_context_str(context)

        history_text = ""
        for msg in history:
            role = "User" if msg.get("role") == "user" else "Coach"
            history_text += f"{role}: {msg.get('content')}\n"

        prompt = f"""You are ForgeAI's intelligent fitness coach. Provide an insightful, motivational, and evidence-grounded response.
User Context:
{context_str}

Conversation History:
{history_text or "No previous messages in this conversation."}

User's new message:
{message}

Please provide a structured response with your reply text, key evidence used from context, relevant data tags, and confidence level."""

        raw_json = self._generate_content(prompt, CoachReply)
        data = json.loads(raw_json)
        data["model_name"] = self.model
        data["model_version"] = self.version
        return CoachReply(**data)

    def summarize_conversation(self, messages: list[dict]) -> str:
        if not messages:
            return ""
        if len(messages) <= 4:
            return super().summarize_conversation(messages)
        try:
            dialogue = "\n".join(
                f"{'User' if m.get('role') == 'user' else 'Coach'}: {m.get('content')}"
                for m in messages
            )
            prompt = f"Summarize this fitness coaching conversation concisely in 1-2 sentences highlighting main topics and user status:\n\n{dialogue}"
            res = self.client.models.generate_content(model=self.model, contents=prompt)
            return res.text.strip()
        except Exception:
            return super().summarize_conversation(messages)
