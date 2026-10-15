import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import SupabaseVerifier
from app.config import get_settings
from app.main import create_app

from test_gate import VALID

TOKENS = {
    "good": {"id": "u-1", "email": "user@example.com", "role": "user", "suspended": False},
    "admin": {"id": "u-2", "email": "eliyamistriel1234@gmail.com", "role": "admin", "suspended": False},
    "banned": {"id": "u-3", "email": "banned@example.com", "role": "user", "suspended": True},
}


def fake_supabase(calls: list[str]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        assert request.headers["apikey"] == "anon-key"
        token = request.headers["authorization"].removeprefix("Bearer ")
        user = TOKENS.get(token)
        if request.url.path == "/auth/v1/user":
            if not user:
                return httpx.Response(401, json={"msg": "invalid JWT"})
            return httpx.Response(200, json={"id": user["id"], "email": user["email"]})
        if request.url.path == "/rest/v1/user_roles":
            assert request.url.params["user_id"] == f"eq.{user['id']}"
            return httpx.Response(200, json=[{"role": user["role"], "suspended": user["suspended"]}])
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def secured(monkeypatch):
    monkeypatch.setenv("AURAFIN_COACH_MODE", "mock")
    monkeypatch.setenv("AURAFIN_SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("AURAFIN_SUPABASE_ANON_KEY", "anon-key")
    get_settings.cache_clear()
    calls: list[str] = []
    with TestClient(create_app()) as client:
        client.app.state.verifier = SupabaseVerifier("https://project.supabase.co", "anon-key", transport=fake_supabase(calls))
        yield client, calls
    get_settings.cache_clear()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health_stays_public(secured):
    client, _ = secured
    assert client.get("/api/health").status_code == 200


@pytest.mark.parametrize("path", ["/api/gate/validate", "/api/coach/plan"])
def test_missing_token_is_rejected(secured, path):
    client, calls = secured
    response = client.post(path, json=VALID)
    assert response.status_code == 401
    assert "התחברות" in response.json()["detail"]
    assert calls == []


def test_invalid_token_is_rejected(secured):
    client, _ = secured
    response = client.post("/api/gate/validate", json=VALID, headers=bearer("forged"))
    assert response.status_code == 401


def test_valid_session_unlocks_gate(secured):
    client, _ = secured
    response = client.post("/api/gate/validate", json=VALID, headers=bearer("good"))
    assert response.status_code == 200
    assert response.json()["status"] == "unlocked"


def test_suspended_user_is_blocked(secured):
    client, _ = secured
    response = client.post("/api/coach/plan", json=VALID, headers=bearer("banned"))
    assert response.status_code == 403
    assert "הושעה" in response.json()["detail"]


def test_verification_is_cached(secured):
    client, calls = secured
    for _ in range(3):
        assert client.post("/api/gate/validate", json=VALID, headers=bearer("admin")).status_code == 200
    assert calls == ["/auth/v1/user", "/rest/v1/user_roles"]


def test_supabase_outage_returns_json_503(secured):
    client, _ = secured

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    client.app.state.verifier = SupabaseVerifier("https://project.supabase.co", "anon-key", transport=httpx.MockTransport(down))
    response = client.post("/api/gate/validate", json=VALID, headers=bearer("good"))
    assert response.status_code == 503
    assert "detail" in response.json()


def test_cors_allows_authorization_header(secured):
    client, _ = secured
    response = client.options(
        "/api/gate/validate",
        headers={
            "Origin": "https://eliya697.github.io",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_auth_not_enforced_without_supabase_settings(monkeypatch):
    monkeypatch.setenv("AURAFIN_COACH_MODE", "mock")
    monkeypatch.delenv("AURAFIN_SUPABASE_URL", raising=False)
    monkeypatch.delenv("AURAFIN_SUPABASE_ANON_KEY", raising=False)
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        assert client.post("/api/gate/validate", json=VALID).status_code == 200
    get_settings.cache_clear()
