"""Tests for Gemini AI Provider — contract validation and integration."""
import pytest
from app.core.config import settings
from app.services.ai.base import (
    AnalysisResult,
    CoachReply,
    PhotoAnalysisInput,
    VideoAnalysisInput,
    UserContext,
)
from app.services.ai.provider import PROVIDERS, get_provider
from app.services.ai.gemini_provider import GeminiProvider, GeminiAnalysisResponse


def test_gemini_provider_registered():
    """Verify GeminiProvider is properly registered in the provider factory."""
    assert "gemini" in PROVIDERS
    assert PROVIDERS["gemini"] is GeminiProvider


def test_gemini_analysis_response_schema_compatibility():
    """Verify that GeminiAnalysisResponse does not produce additionalProperties: True,
    ensuring compatibility with Gemini Developer API mode."""
    schema = GeminiAnalysisResponse.model_json_schema()
    for prop_name, prop_def in schema.get("properties", {}).items():
        assert "additionalProperties" not in prop_def, f"{prop_name} has additionalProperties"
    assert schema.get("additionalProperties") is not True


@pytest.mark.skipif(not settings.GEMINI_API_KEY, reason="GEMINI_API_KEY not configured")
def test_gemini_live_coach_reply():
    """Live test of coach chat generation with Gemini."""
    provider = GeminiProvider()
    ctx = UserContext(
        user_id=1,
        name="Tester",
        goal_type="recomposition",
        weight_current_kg=68.0,
        protein_avg_7d=130.0,
        protein_target_g=140.0,
        calories_avg_7d=2100.0,
        calorie_target_kcal=2200.0,
    )
    reply = provider.generate_coach_reply(
        message="How am I doing on my protein target?",
        history=[],
        context=ctx,
    )
    assert isinstance(reply, CoachReply)
    assert len(reply.text) > 20
    assert reply.confidence is not None and 0.0 <= reply.confidence <= 1.0
    assert isinstance(reply.evidence, list)


@pytest.mark.skipif(not settings.GEMINI_API_KEY, reason="GEMINI_API_KEY not configured")
def test_gemini_live_photo_analysis():
    """Live test of structured photo analysis with Gemini."""
    provider = GeminiProvider()
    ctx = UserContext(user_id=1, name="Tester", goal_type="hypertrophy", weight_current_kg=70.0)
    res = provider.analyze_photo(PhotoAnalysisInput(
        photo_id=1,
        photo_type="front",
        captured_at="20 Sep 2026",
        bodyweight_kg=70.0,
        notes="Morning check-in",
        previous_photos_count=1,
        user=ctx,
    ))
    assert isinstance(res, AnalysisResult)
    assert len(res.title) > 0
    assert len(res.summary) > 0
    assert len(res.analysis) > 0
    assert res.metrics["photo_type"] == "front"
    assert res.metrics["bodyweight_kg"] == 70.0
    assert res.metrics["previous_photos_count"] == 1
    assert res.confidence is not None


@pytest.mark.skipif(not settings.GEMINI_API_KEY, reason="GEMINI_API_KEY not configured")
def test_gemini_live_video_analysis():
    """Live test of structured video analysis with Gemini."""
    provider = GeminiProvider()
    ctx = UserContext(user_id=1, name="Tester", goal_type="strength")
    res = provider.analyze_video(VideoAnalysisInput(
        video_id=2,
        exercise="Bench Press",
        duration_s=30.0,
        notes="3 reps at 80kg",
        user=ctx,
    ))
    assert isinstance(res, AnalysisResult)
    assert "Bench Press" in res.title or "Bench Press" in res.analysis or res.metrics["exercise"] == "Bench Press"
    assert res.metrics["exercise"] == "Bench Press"
    assert res.metrics["duration_s"] == 30.0
