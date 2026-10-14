"""Pins the analysis engine to shared/fixtures/analysis_cases.json (also checked against the JS port)."""

import json
from pathlib import Path

import pytest

from app.analysis import analyze
from app.schemas import FinancialSnapshot

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "analysis_cases.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_analysis_matches_fixture(case):
    assert analyze(FinancialSnapshot.model_validate(case["snapshot"])).model_dump() == case["expected"]
