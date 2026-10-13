import copy
import json

import anthropic
import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from app.coach import CoachService
from app.config import get_settings
from app.main import create_app

VALID = {
    "profile": {"life_stage": "student", "primary_goal": "safety_net", "track_id": "student_smart"},
    "income": 7000,
    "fixed": {"rent": 2200, "electricity": 180, "water": 60, "municipal": 150},
    "variable": {"entertainment": 450, "dining": 1100, "shopping": 500},
    "unexpected": 300,
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AURAFIN_COACH_MODE", "mock")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    get_settings.cache_clear()


def without(path: str) -> dict:
    payload = copy.deepcopy(VALID)
    *parents, leaf = path.split(".")
    node = payload
    for key in parents:
        node = node[key]
    del node[leaf]
    return payload


def fields(response) -> dict[str, str]:
    return {item["field"]: item["message"] for item in response.json()["fields"]}


def test_complete_snapshot_unlocks_gate(client):
    response = client.post("/api/gate/validate", json=VALID)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unlocked"
    analysis = body["analysis"]
    assert analysis["total_expenses"] == 4940
    assert analysis["projected_savings"] == 2060
    assert analysis["savings_goal"] == 700
    assert [leak["category"] for leak in analysis["leaks"]] == ["dining", "entertainment", "shopping"]  # sorted by excess: 680, 100, 80


@pytest.mark.parametrize(
    "path",
    ["income", "unexpected", "fixed.rent", "fixed.municipal", "variable.dining", "variable.entertainment", "profile.track_id"],
)
def test_missing_field_blocks_gate(client, path):
    response = client.post("/api/gate/validate", json=without(path))
    assert response.status_code == 422
    assert response.json()["error"] == "incomplete_financial_data"
    assert path in fields(response)


def test_unexpected_reserve_must_be_positive(client):
    payload = copy.deepcopy(VALID) | {"unexpected": 0}
    response = client.post("/api/gate/validate", json=payload)
    assert response.status_code == 422
    assert "בלת\"מים" in fields(response)["unexpected"]


def test_zero_rent_is_allowed(client):
    payload = copy.deepcopy(VALID)
    payload["fixed"]["rent"] = 0
    assert client.post("/api/gate/validate", json=payload).status_code == 200


@pytest.mark.parametrize("bad", ["", "1200", None, -50, 5_000_000])
def test_bad_values_are_rejected(client, bad):
    payload = copy.deepcopy(VALID)
    payload["variable"]["shopping"] = bad
    response = client.post("/api/gate/validate", json=payload)
    assert response.status_code == 422
    assert "variable.shopping" in fields(response)


def test_unknown_track_and_extra_fields_rejected(client):
    payload = copy.deepcopy(VALID)
    payload["profile"]["track_id"] = "lambo_track"
    payload["fixed"]["yacht"] = 100
    found = fields(client.post("/api/gate/validate", json=payload))
    assert "profile.track_id" in found
    assert "fixed.yacht" in found


def test_plan_endpoint_enforces_the_same_gate(client):
    response = client.post("/api/coach/plan", json=without("unexpected"))
    assert response.status_code == 422


def test_plan_mock_mode(client):
    response = client.post("/api/coach/plan", json=VALID)
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mock"
    plan = body["plan"]
    assert plan["savings_plan_markdown"].count("## ") == 3
    assert plan["leaks"] and plan["do_not_buy"]


def test_claude_request_shape(client):
    captured = {}
    plan = {
        "headline": "החודש: ₪165 בשבוע לאוכל בחוץ",
        "savings_plan_markdown": "## התמונה הכוללת\nא\n## התוכנית לחודש הקרוב\nב\n## ההרגל שמשנה הכול\nג",
        "leaks": [{"category": "dining", "title": "t", "explanation": "e", "monthly_saving": 680}],
        "do_not_buy": [{"item": "משלוח סושי", "reason": "r", "estimated_saving": 220}],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        captured["beta"] = request.headers.get("anthropic-beta")
        return httpx.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "claude-sonnet-5-5",
                "content": [{"type": "text", "text": json.dumps(plan, ensure_ascii=False)}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 900, "output_tokens": 400},
            },
        )

    fake = anthropic.AsyncAnthropic(api_key="test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    client.app.state.coach = CoachService(get_settings(), fake)

    response = client.post("/api/coach/plan", json=VALID)
    assert response.status_code == 200, response.text
    assert response.json()["source"] == "claude"
    assert response.json()["plan"]["headline"] == plan["headline"]

    body = captured["body"]
    assert body["model"] == "claude-sonnet-5-5"
    assert body["thinking"] == {"type": "adaptive"}
    assert body["output_config"]["effort"] == "medium"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in captured["beta"]
    assert "₪1,100" in body["messages"][0]["content"]


def test_missing_income_message_does_not_suggest_zero(client):
    message = fields(client.post("/api/gate/validate", json=without("income")))["income"]
    assert "כתבו 0" not in message
