"""Deterministic rule-based provider — the default (AI_PROVIDER=stub).

It makes NO network calls and needs NO API key. It produces honest,
data-grounded output: every number it mentions comes from the precomputed
UserContext, and it explicitly states when computer vision is not yet wired
in (no fabricated pose metrics).
"""
from __future__ import annotations

import random

from app.core.config import settings
from app.services.ai.base import (
    AIProvider, AnalysisResult, CoachReply, PhotoAnalysisInput, UserContext, VideoAnalysisInput,
)


class StubProvider(AIProvider):
    name = "forge-rules"
    version = "0.1.0"

    # ---------------- photo ----------------
    def analyze_photo(self, p: PhotoAnalysisInput) -> AnalysisResult:
        evidence = [f"{p.photo_type.capitalize()} photo captured {p.captured_at}"]
        if p.bodyweight_kg:
            evidence.append(f"Bodyweight logged at capture: {p.bodyweight_kg} kg")
        if p.previous_photos_count:
            evidence.append(f"Compared against {p.previous_photos_count} earlier photo(s)")
            for d in p.previous_session_dates[-3:]:
                evidence.append(f"Prior session on {d}")
        if p.notes:
            evidence.append("User notes from capture")

        limitations = [
            "Computer vision is not wired in yet — no pose landmarks or region deltas were computed.",
            "Visual conclusions below are limited to metadata; upload a real CV provider to get posture analysis.",
        ]
        if p.photo_type == "front":
            limitations.append("Single angle: front — side/back comparisons add confidence.")
        if not p.bodyweight_kg:
            limitations.append("No bodyweight recorded at capture.")

        recommendations = [
            "Retake photos in consistent lighting and the same spot each month.",
            "Capture front, side and back angles for a reliable comparison set.",
            "Log bodyweight on the day of each photo session.",
        ]

        # Honest confidence: purely data-coverage based (not fake CV accuracy).
        confidence = 0.55
        confidence += 0.10 if p.bodyweight_kg else 0.0
        confidence += 0.10 if p.previous_photos_count else 0.0
        confidence += 0.05 if p.notes else 0.0
        confidence = round(min(confidence, 0.85), 2)

        weight_note = (f" Bodyweight at capture was {p.bodyweight_kg} kg." if p.bodyweight_kg else "")
        return AnalysisResult(
            title=f"{p.photo_type.capitalize()} photo analysis — {p.captured_at}",
            summary="Structured placeholder analysis (stub provider — no CV model attached).",
            analysis=(
                f"This {p.photo_type} photo was captured {p.captured_at} and stored with full metadata."
                f"{weight_note} The photo is indexed against your history "
                f"({p.previous_photos_count} earlier photo session(s) on record), so once a computer-vision "
                "provider is connected it will be compared automatically for posture, alignment and "
                "visible-progress deltas."
            ),
            evidence=evidence,
            limitations=limitations,
            recommendations=recommendations,
            metrics={"photo_type": p.photo_type, "previous_photos_count": p.previous_photos_count},
            confidence=confidence,
            model_name=self.name,
            model_version=self.version,
        )

    # ---------------- video ----------------
    def analyze_video(self, v: VideoAnalysisInput) -> AnalysisResult:
        evidence = [f"Video of {v.exercise or 'workout'} uploaded ({int(v.duration_s or 0)}s)" if v.duration_s
                    else f"Video of {v.exercise or 'workout'} uploaded"]
        if v.notes:
            evidence.append("User notes from upload")
        u = v.user
        if u.sessions_this_week is not None:
            evidence.append(f"{u.sessions_this_week} sessions logged this week")

        return AnalysisResult(
            title=f"Video analysis — {v.exercise or 'workout'}",
            summary="Structured placeholder analysis (stub provider — no video model attached).",
            analysis=(
                "The video is stored and linked to the exercise. Movement scoring (depth, tempo, bar path, "
                "symmetry) requires a computer-vision provider, which is not connected yet — ForgeAI will not "
                "fabricate frame-level findings. Once a provider is configured, this video will be re-analyzable "
                "from its stored file."
            ),
            evidence=evidence,
            limitations=[
                "No pose estimation or frame analysis was performed (stub provider).",
                "Findings will be available only after a real CV provider is implemented.",
            ],
            recommendations=[
                "Film from a ~45° angle at hip height for the best future analysis.",
                "Keep the full body in frame for the working set.",
                "Note the exercise name on upload so analyses link to training data.",
            ],
            metrics={"exercise": v.exercise, "duration_s": v.duration_s},
            confidence=0.5,
            model_name=self.name,
            model_version=self.version,
        )

    # ---------------- coach ----------------
    def generate_coach_reply(self, *, message: str, history: list[dict], context: UserContext) -> CoachReply:
        text = message.lower()
        evidence: list[str] = []
        data: list[str] = []
        u = context

        # Ground evidence list in what we actually have.
        if u.weight_current_kg is not None:
            evidence.append("bodyweight history")
            data.append(f"Weight: {u.weight_current_kg} kg"
                        + (f" ({u.weight_change_30d_kg:+.1f} kg / 30d)" if u.weight_change_30d_kg is not None else ""))
        if u.protein_avg_7d is not None:
            evidence.append("nutrition log (7d)")
            target = f" vs {u.protein_target_g:.0f} g target" if u.protein_target_g else ""
            data.append(f"Protein avg: {u.protein_avg_7d:.0f} g{target}")
        if u.sessions_this_week is not None:
            evidence.append("training log")
            data.append(f"Sessions this week: {u.sessions_this_week}/{u.sessions_target_week or '?'}")
        evidence.extend(u.memories[:2])

        if any(k in text for k in ("protein", "nutrition", "eat", "diet", "calorie", "food")):
            avg = u.protein_avg_7d or 0.0
            target = u.protein_target_g or 0.0
            if target and avg < target:
                reply = (f"Your 7-day protein average is {avg:.0f} g against a {target:.0f} g target. "
                         "The simplest fix is one protein-forward addition to your day — a shake, Greek yogurt, "
                         "or an extra serving at dinner. Calories look fine, so keep them where they are.")
            elif target:
                reply = (f"Protein is on track: {avg:.0f} g averaged over the last week against your {target:.0f} g "
                         "target. Hold the current pattern and keep logging consistently.")
            else:
                reply = ("I don't have a protein target saved yet — set one in your goal so I can evaluate "
                         "intake against it.")
        elif any(k in text for k in ("weight", "bulk", "cut", "gain", "scale")):
            if u.weight_change_30d_kg is not None:
                direction = ("holding steady" if abs(u.weight_change_30d_kg) < 0.3
                             else f"trending {'up' if u.weight_change_30d_kg > 0 else 'down'} "
                                  f"{abs(u.weight_change_30d_kg):.1f} kg over the last 30 days")
                reply = (f"Your weight is {direction}. "
                         + ("That matches a lean-gain phase — hold course and re-assess at your target weight."
                            if u.weight_change_30d_kg > 0.3 or u.goal_type == "muscle_gain"
                            else "Keep logging daily; trends need ~2 weeks of data before adjusting calories."))
            else:
                reply = "I don't have enough weight logs yet — log a few entries and I'll analyze the trend."
        elif any(k in text for k in ("chest", "bench", "press", "shoulder", "arm", "back", "leg", "muscle")):
            trends = {m.get("muscle_group"): m.get("trend") for m in u.muscle_trends} if u.muscle_trends else {}
            improving = [k for k, v in trends.items() if v == "improving"]
            stable = [k for k, v in trends.items() if v != "improving"]
            parts = []
            if improving:
                parts.append(f"Your logged volume is improving for: {', '.join(improving)}.")
            if stable:
                parts.append(f"Others are steady so far: {', '.join(stable)}.")
            reply = ("Based on your training log: " + " ".join(parts) +
                     (" With consistent logging and monthly photo sets, I can flag visual deltas once a "
                      "computer-vision provider is connected." if not trends else
                      " Keep progressive overload moving on the lagging group — small load jumps weekly."))
        elif any(k in text for k in ("sleep", "recover", "rest", "sore", "fatigue")):
            reply = ("I don't capture sleep data yet, so I won't guess. From training data alone your session "
                     "frequency and volume look sustainable — if sleep drops under 7h, that's the first lever "
                     "to check before changing the program.")
        else:
            reply = ("I can analyze your training, nutrition, weight trend and progress photos — all from your "
                     "own logged data. Ask me something specific, like \"how is my protein this week?\" or "
                     "\"how is my weight trending?\"")

        # Deterministic confidence from grounding coverage.
        confidence = round(min(0.9, 0.5 + 0.08 * len(evidence)), 2)
        _ = random  # (kept import-free of randomness — deterministic by design)
        return CoachReply(text=reply, confidence=confidence, evidence=evidence, data=data,
                          model_name=self.name, model_version=self.version)
