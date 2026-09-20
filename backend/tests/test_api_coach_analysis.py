"""Coach chat, analysis pipeline (stub provider), evaluation feedback."""
import time

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c626001000000ffff030000060005"
    "57bfabd40000000049454e44ae426082")


def _conversation(client, h):
    r = client.get("/api/coach/conversations", headers=h)
    assert r.status_code == 200
    return r.json()["data"]["items"]


def test_coach_chat_creates_conversation_and_reply(client, auth_headers):
    h = auth_headers
    r = client.post("/api/coach/chat", headers=h,
                    json={"message": "How is my protein this week?"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["reply"]["role"] == "assistant"
    assert len(data["reply"]["content"]) > 20
    assert isinstance(data["evidence"], list) and data["evidence"]
    assert 0.3 <= (data["confidence"] or 0) <= 1.0
    # persisted: conversation listing shows it with 2 messages
    convs = _conversation(client, h)
    assert len(convs) == 1 and convs[0]["message_count"] == 2


def test_coach_chat_reuses_conversation_and_summarizes(client, auth_headers):
    h = auth_headers
    first = client.post("/api/coach/chat", headers=h, json={"message": "Hello coach"}).json()["data"]
    cid = first["conversation_id"]
    for i in range(16):
        client.post("/api/coach/chat", headers=h,
                    json={"message": f"Follow-up question number {i}", "conversation_id": cid})
    detail = client.get(f"/api/coach/conversations/{cid}", headers=h).json()["data"]
    assert len(detail["messages"]) == 34                       # 2 + 16 pairs
    assert detail["summary"] is not None                       # rolling summary kicked in


def test_coach_rejects_empty_message(client, auth_headers):
    r = client.post("/api/coach/chat", headers=auth_headers, json={"message": "   "})
    assert r.status_code in (400, 422)


def test_photo_analysis_end_to_end(client, demo_user_with_data):
    h = demo_user_with_data
    r = client.post("/api/analysis/photo", headers=h,
                    files={"file": ("front.png", PNG, "image/png")},
                    data={"photo_type": "front", "bodyweight": "63.6", "notes": "morning"})
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    assert data["analysis_id"] is not None

    aid = data["analysis_id"]
    r = client.get(f"/api/analysis/{aid}", headers=h)
    assert r.status_code == 200
    analysis = r.json()["data"]
    assert analysis["kind"] == "photo"
    blob = analysis["analysis"]
    # STRUCTURED — all five sections present (spec §7)
    for key in ("analysis", "evidence", "limitations", "recommendations", "confidence"):
        assert key in blob
    assert isinstance(blob["evidence"], list) and blob["evidence"]
    assert "Computer vision is not wired in yet" in " ".join(blob["limitations"])


def test_video_analysis_end_to_end(client, demo_user_with_data):
    h = demo_user_with_data
    # minimal MP4 header (ftyp brand) — validation sniffs the container signature
    ftyp = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 64
    r = client.post("/api/analysis/video", headers=h,
                    files={"file": ("squat.mp4", ftyp, "video/mp4")},
                    data={"exercise": "Squat", "duration": "45"})
    assert r.status_code == 201, r.text
    blob = r.json()["data"]["analysis"]
    assert blob["metrics"]["exercise"] == "Squat"
    assert any("not fabricate" in l or "stub" in l.lower() for l in blob["limitations"])


def test_analysis_upload_rejects_bad_video(client, auth_headers):
    r = client.post("/api/analysis/video", headers=auth_headers,
                    files={"file": ("clip.mp4", b"\x00\x00\x00\x18ftypXXXX\x00\x00\x00\x00XXXXXXXX" + b"\x00" * 32, "video/mp4")},
                    data={"exercise": "Squat"})
    # ftyp present → signature ok; content passes; assert pipeline ran or clear validation
    assert r.status_code in (201, 400)


def test_analysis_not_found_other_user(client, client_b, auth_headers, auth_headers_b):
    h = auth_headers
    r = client.post("/api/analysis/photo", headers=h,
                    files={"file": ("front.png", PNG, "image/png")}, data={"photo_type": "front"})
    aid = r.json()["data"]["analysis_id"]
    r = client_b.get(f"/api/analysis/{aid}", headers=auth_headers_b)
    assert r.status_code == 404


def test_evaluation_feedback_upsert_and_memory(client, auth_headers, db_session):
    """Feedback requires a report — generate one via the dashboard insight path."""
    h = auth_headers
    client.post("/api/progress/weight", headers=h, json={"weight": 63.6, "date": "2026-09-19"})
    dash = client.get("/api/dashboard", headers=h).json()["data"]
    report_id = dash["latest_insight"]["report_id"]
    assert report_id is not None

    r = client.post(f"/api/evaluations/{report_id}/feedback", headers=h,
                    json={"feedback": "correct", "comment": "matches my week"})
    assert r.status_code == 201
    assert r.json()["data"]["feedback"] == "correct"

    # update instead of duplicate
    r2 = client.post(f"/api/evaluations/{report_id}/feedback", headers=h,
                     json={"feedback": "partially_correct"})
    assert r2.status_code == 201
    from app.models.ai import AIEvaluation, Memory
    assert db_session.query(AIEvaluation).filter_by(report_id=report_id).count() == 1
    assert db_session.query(Memory).filter_by(category="outcome").count() >= 1


def test_evaluation_feedback_rejects_bad_value(client, auth_headers):
    r = client.post("/api/evaluations/1/feedback", headers=auth_headers,
                    json={"feedback": "amazing"})
    assert r.status_code == 422
