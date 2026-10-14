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
    "profile": {
        "life_stage": "student",
        "primary_goal": "safety_net",
        "track_id": "student_smart",
        "has_children": False,
        "children_count": 0,
    },
    "income": 7000,
    "fixed": {"rent": 2200, "electricity": 180, "water": 60, "municipal": 150},
    "variable": {"entertainment": 450, "dining": 1100, "shopping": 500},
    "unexpected": 300,
    "children_expenses": 0,
    "custom_expenses": [],
}

FAMILY = {
    "profile": {
        "life_stage": "young_family",
        "primary_goal": "house",
        "track_id": "family_shield",
        "has_children": True,
        "children_count": 2,
    },
    "income": 20000,
    "fixed": {"rent": 6000, "electricity": 400, "water": 150, "municipal": 500},
    "variable": {"entertainment": 600, "dining": 900, "shopping": 1200},
    "unexpected": 1000,
    "children_expenses": 3200,
    "custom_expenses": [{"title": "חדר כושר", "amount": 250}, {"title": "  ביטוח רכב  ", "amount": 450}],
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
    [
        "income",
        "unexpected",
        "fixed.rent",
        "fixed.municipal",
        "variable.dining",
        "variable.entertainment",
        "profile.track_id",
        "profile.has_children",
        "profile.children_count",
        "children_expenses",
        "custom_expenses",
    ],
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


# ── Children ──────────────────────────────────────────────────────────────────


def test_family_snapshot_totals_include_children_and_custom(client):
    analysis = client.post("/api/gate/validate", json=FAMILY).json()["analysis"]
    assert analysis["breakdown"]["children"] == 3200
    assert analysis["breakdown"]["custom"] == 700
    assert analysis["total_expenses"] == 14650  # 7050 + 2100 + 600 + 1000 + 3200 + 700
    assert analysis["projected_savings"] == 5350
    assert analysis["children_count"] == 2


def test_children_raise_the_reserve_target(client):
    # family_shield min 6% + 2 children x 1% = 8% of 20,000 = 1,600 > 1,000 entered
    analysis = client.post("/api/gate/validate", json=FAMILY).json()["analysis"]
    assert analysis["reserve_target"] == 1600
    reserve = next(leak for leak in analysis["leaks"] if leak["category"] == "unexpected")
    assert reserve["kind"] == "under_reserved"
    assert reserve["benchmark_share"] == 0.08
    assert reserve["excess_amount"] == 600


def test_children_reserve_boost_is_capped(client):
    payload = copy.deepcopy(FAMILY)
    payload["profile"]["children_count"] = 9
    analysis = client.post("/api/gate/validate", json=payload).json()["analysis"]
    assert analysis["reserve_target"] == 2000  # 6% + capped 4% = 10%


def test_has_children_requires_count(client):
    payload = copy.deepcopy(FAMILY)
    payload["profile"]["children_count"] = 0
    assert "profile.children_count" in fields(client.post("/api/gate/validate", json=payload))


def test_has_children_requires_children_expenses(client):
    payload = copy.deepcopy(FAMILY)
    payload["children_expenses"] = 0
    found = fields(client.post("/api/gate/validate", json=payload))
    assert "ילדים" in found["children_expenses"]


def test_no_children_rejects_children_data(client):
    payload = copy.deepcopy(VALID)
    payload["profile"]["children_count"] = 2
    payload["children_expenses"] = 500
    found = fields(client.post("/api/gate/validate", json=payload))
    assert "profile.children_count" in found


def test_children_count_must_be_integer(client):
    payload = copy.deepcopy(FAMILY)
    payload["profile"]["children_count"] = 1.5
    assert "profile.children_count" in fields(client.post("/api/gate/validate", json=payload))


# ── Custom expenses ───────────────────────────────────────────────────────────


def test_custom_expense_needs_title(client):
    payload = copy.deepcopy(FAMILY)
    payload["custom_expenses"][1]["title"] = "   "
    found = fields(client.post("/api/gate/validate", json=payload))
    assert "custom_expenses.1.title" in found


def test_custom_expense_amount_must_be_positive(client):
    payload = copy.deepcopy(FAMILY)
    payload["custom_expenses"][0]["amount"] = 0
    assert "custom_expenses.0.amount" in fields(client.post("/api/gate/validate", json=payload))


def test_custom_expense_title_length_and_count_limits(client):
    payload = copy.deepcopy(VALID)
    payload["custom_expenses"] = [{"title": "x" * 41, "amount": 10}]
    assert "custom_expenses.0.title" in fields(client.post("/api/gate/validate", json=payload))
    payload["custom_expenses"] = [{"title": f"item {i}", "amount": 10} for i in range(21)]
    assert "custom_expenses" in fields(client.post("/api/gate/validate", json=payload))


def test_custom_items_reach_the_prompt(client):
    from app.analysis import analyze
    from app.prompts import build_user_prompt
    from app.schemas import FinancialSnapshot

    snapshot = FinancialSnapshot.model_validate(FAMILY)
    prompt = build_user_prompt(snapshot, analyze(snapshot))
    assert "- ביטוח רכב: ₪450" in prompt  # title is whitespace-stripped
    assert "Children: 2" in prompt
    assert "recommended minimum for this household: ₪1,600" in prompt
