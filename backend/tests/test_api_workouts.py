"""Workout endpoints: create, add sets, aggregates, PRs."""


def _make_session(client, h):
    r = client.post("/api/workouts", headers=h, json={
        "date": "2026-09-18", "name": "Push A", "duration": 60,
        "sets": [{"exercise": "Bench Press", "muscle_group": "chest", "set_number": 1,
                  "weight": 25, "reps": 8, "rir": 2}]})
    assert r.status_code == 201, r.text
    return r.json()["data"]


def test_create_session_with_sets(client, auth_headers):
    data = _make_session(client, auth_headers)
    assert data["name"] == "Push A"
    assert len(data["sets"]) == 1
    assert data["sets"][0]["volume"] == 200.0               # 25 kg × 8
    assert data["volume_kg"] == 200.0


def test_add_sets_endpoint(client, auth_headers):
    data = _make_session(client, auth_headers)
    sid = data["id"]
    r = client.post(f"/api/workouts/{sid}/sets", headers=auth_headers, json={
        "sets": [{"exercise": "Bench Press", "set_number": 2, "weight": 25, "reps": 7}]})
    assert r.status_code == 201
    assert len(r.json()["data"]["sets"]) == 2


def test_add_sets_rejects_foreign_session(client, client_b, auth_headers_b):
    """Sessions belong to their owner — 404, never 403-with-confirmation."""
    r = client_b.post("/api/workouts/1/sets", headers=auth_headers_b,
                      json={"sets": [{"exercise": "X", "reps": 5}]})
    assert r.status_code == 404


def test_workouts_list_aggregates(client, demo_user_with_data):
    h = demo_user_with_data
    r = client.get("/api/workouts", headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["sessions"][0]["name"] == "Push A"
    assert any(w["exercise"] == "Bench Press" for w in data["prs"])
    assert len(data["week"]) == 7
    assert any(d["trained"] for d in data["week"])
    assert data["stats"]["muscle_volume"][0]["muscle_group"] == "chest"


def test_exercise_catalog_auto_created(client, auth_headers, db_session):
    from app.models.workout import Exercise
    _make_session(client, auth_headers)
    row = db_session.query(Exercise).filter_by(name="Bench Press").one()
    assert row.muscle_group == "chest"
