"""Regenerates shared/fixtures/analysis_cases.json from the Python analysis engine.

Run after an intentional change to analysis rules:  python scripts/update_analysis_fixtures.py
The fixtures pin the Python engine (tests/test_analysis_parity.py) and its JS port used by the
offline fallback (web/tests/analysis.parity.test.mjs) to identical output.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analysis import analyze  # noqa: E402
from app.schemas import FinancialSnapshot  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "analysis_cases.json"


def profile(life_stage, goal, track, children=0):
    return {
        "life_stage": life_stage,
        "primary_goal": goal,
        "track_id": track,
        "has_children": children > 0,
        "children_count": children,
    }


CASES = {
    "student_with_leaks": {
        "profile": profile("student", "safety_net", "student_smart"),
        "income": 7000,
        "fixed": {"rent": 2200, "electricity": 180, "water": 60, "municipal": 150},
        "variable": {"entertainment": 450, "dining": 1100, "shopping": 500},
        "unexpected": 300,
        "children_expenses": 0,
        "custom_expenses": [],
    },
    "family_two_kids_under_reserved": {
        "profile": profile("young_family", "house", "family_shield", children=2),
        "income": 20000,
        "fixed": {"rent": 6000, "electricity": 400, "water": 150, "municipal": 500},
        "variable": {"entertainment": 600, "dining": 900, "shopping": 1200},
        "unexpected": 1000,
        "children_expenses": 3200,
        "custom_expenses": [{"title": "חדר כושר", "amount": 250}, {"title": "ביטוח רכב", "amount": 450}],
    },
    "debt_overspending": {
        "profile": profile("employee", "debt", "debt_breaker", children=1),
        "income": 9000,
        "fixed": {"rent": 4200, "electricity": 300, "water": 100, "municipal": 350},
        "variable": {"entertainment": 900, "dining": 1600, "shopping": 1400},
        "unexpected": 200,
        "children_expenses": 1500,
        "custom_expenses": [{"title": "החזר הלוואה", "amount": 1200}],
    },
    "on_track_freelancer_fractions": {
        "profile": profile("freelancer", "safety_net", "freelancer_growth"),
        "income": 13333.33,
        "fixed": {"rent": 3500.5, "electricity": 222.25, "water": 77.75, "municipal": 410.5},
        "variable": {"entertainment": 333.5, "dining": 666.5, "shopping": 0},
        "unexpected": 1066.67,
        "children_expenses": 0,
        "custom_expenses": [{"title": "תוכנות לעבודה", "amount": 189.9}],
    },
    "many_kids_capped_boost": {
        "profile": profile("young_family", "safety_net", "family_shield", children=7),
        "income": 24500,
        "fixed": {"rent": 7500, "electricity": 900, "water": 300, "municipal": 700},
        "variable": {"entertainment": 500, "dining": 700, "shopping": 2100},
        "unexpected": 2450,
        "children_expenses": 6300,
        "custom_expenses": [],
    },
}


def main() -> None:
    cases = [
        {"name": name, "snapshot": snapshot, "expected": analyze(FinancialSnapshot.model_validate(snapshot)).model_dump()}
        for name, snapshot in CASES.items()
    ]
    FIXTURES.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES.write_text(json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(cases)} cases to {FIXTURES}")


if __name__ == "__main__":
    main()
