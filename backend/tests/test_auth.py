"""Authentication: register, login, me, failures, envelope shape."""
from tests.conftest import register_and_login


def test_register_login_me(client):
    headers = register_and_login(client)
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True and body["error"] is None
    assert body["data"]["email"] == "test@example.com"
    assert body["data"]["name"] == "Test"
    assert "password_hash" not in body["data"]          # never leaked


def test_register_rejects_duplicate_email(client):
    register_and_login(client)
    r = client.post("/api/auth/register", json={
        "email": "test@example.com", "password": "another-pass-1", "name": "X"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "email_taken"


def test_register_rejects_short_password(client):
    r = client.post("/api/auth/register", json={
        "email": "short@example.com", "password": "short", "name": "X"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_login_wrong_password(client):
    register_and_login(client)
    r = client.post("/api/auth/login", json={"email": "test@example.com", "password": "wrong-pass-1"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"


def test_me_requires_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_rejects_garbage_token(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_token"
