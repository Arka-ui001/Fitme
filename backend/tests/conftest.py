"""Test configuration — isolated SQLite DB per test, FastAPI TestClient."""
from __future__ import annotations

import os
import tempfile

# Configure env BEFORE the app imports settings.
_TEST_DB = os.path.join(tempfile.mkdtemp(prefix="forgeai-tests-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ["SECRET_KEY"] = "test-secret-key-0123456789abcdef0123456789abcdef"
os.environ["ENV"] = "dev"
os.environ["DEBUG"] = "false"
os.environ["RATE_LIMIT_AUTH_PER_MIN"] = "10000"
os.environ["RATE_LIMIT_CHAT_PER_MIN"] = "10000"
os.environ["RATE_LIMIT_UPLOAD_PER_MIN"] = "10000"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="forgeai-uploads-")
os.environ["AI_PROVIDER"] = "stub"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db.session import engine  # noqa: E402
from app.db import base  # noqa: F401,E402  (register all models)
from app.models.base import Base  # noqa: E402

TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


@pytest.fixture()
def db_session():
    """Fresh schema per test — drop_all/create_all keeps tests order-independent."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    from app.db.session import get_db
    from app.main import create_app

    app = create_app()

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c


# ---------------- helpers ----------------
def register_and_login(client, email="test@example.com", password="sup3rsecret", name="Test"):
    r = client.post("/api/auth/register", json={"email": email, "password": password, "name": name})
    assert r.status_code == 201, r.text
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def auth_headers(client):
    return register_and_login(client)


@pytest.fixture()
def client_b(client, db_session):
    """Second isolated user (fresh schema already applied) for authorization tests."""
    return client


@pytest.fixture()
def auth_headers_b(client_b):
    return register_and_login(client_b, email="other@example.com", password="another-pass-1", name="Other")


@pytest.fixture()
def demo_user_with_data(client, auth_headers):
    """Full data bundle via the API itself (integration-style)."""
    h = auth_headers
    # weight logs
    for i, w in enumerate([62.0, 62.4, 62.8, 63.0, 63.4, 63.6]):
        client.post("/api/progress/weight", json={"weight": w, "date": f"2026-09-{10 + i}" if i < 6 else None},
                    headers=h)
    # workout session with sets
    r = client.post("/api/workouts", headers=h, json={
        "date": "2026-09-18", "name": "Push A", "duration": 60,
        "sets": [
            {"exercise": "Bench Press", "muscle_group": "chest", "set_number": 1, "weight": 25, "reps": 8, "rir": 2},
            {"exercise": "Bench Press", "muscle_group": "chest", "set_number": 2, "weight": 25, "reps": 7, "rir": 2},
            {"exercise": "Overhead Press", "muscle_group": "shoulders", "set_number": 1, "weight": 22.5, "reps": 8, "rir": 2},
        ]})
    assert r.status_code == 201, r.text
    # food item + meal + log
    client.post("/api/nutrition/food", headers=h,
                json={"name": "Chicken breast", "serving_size": 150, "calories": 248, "protein": 46.5,
                      "carbohydrates": 0, "fat": 5.4, "fiber": 0})
    r = client.post("/api/nutrition/meals", headers=h,
                    json={"meal_type": "lunch", "logs": [{"food_item_id": 1, "quantity": 2}]})
    assert r.status_code == 201, r.text
    return h
