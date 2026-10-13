"""Request/response contracts.

FinancialSnapshot is the server-side enforcer of the Mandatory Expense Gate: every field is
required (no defaults), unknown fields are rejected, values must be real JSON numbers, and
income and the unexpected-costs reserve must be positive. An incomplete snapshot never reaches
the AI engine.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .catalog import get_catalog

MAX_AMOUNT = get_catalog().max_amount

LifeStage = Literal["student", "employee", "freelancer", "young_family"]
PrimaryGoal = Literal["house", "debt", "safety_net"]

Amount = Annotated[float, Field(ge=0, le=MAX_AMOUNT, allow_inf_nan=False)]
PositiveAmount = Annotated[float, Field(gt=0, le=MAX_AMOUNT, allow_inf_nan=False)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class FinancialProfile(StrictModel):
    life_stage: LifeStage
    primary_goal: PrimaryGoal
    track_id: str

    @field_validator("track_id")
    @classmethod
    def track_must_exist(cls, value: str) -> str:
        if value not in get_catalog().tracks:
            raise ValueError("unknown_track")
        return value


class FixedExpenses(StrictModel):
    rent: Amount
    electricity: Amount
    water: Amount
    municipal: Amount


class VariableExpenses(StrictModel):
    entertainment: Amount
    dining: Amount
    shopping: Amount


class FinancialSnapshot(StrictModel):
    profile: FinancialProfile
    income: PositiveAmount
    fixed: FixedExpenses
    variable: VariableExpenses
    unexpected: PositiveAmount


# ── Analysis (deterministic, computed in analysis.py) ─────────────────────────


class CategoryBreakdown(BaseModel):
    fixed: float
    variable: float
    entertainment: float
    unexpected: float


LeakCategory = Literal["dining", "shopping", "entertainment", "unexpected"]


class DetectedLeak(BaseModel):
    category: LeakCategory
    label: str
    amount: float
    share_of_income: float
    benchmark_share: float
    excess_amount: float
    kind: Literal["overspend", "under_reserved"]


class BudgetAnalysis(BaseModel):
    track_id: str
    track_name: str
    total_expenses: float
    projected_savings: float
    savings_rate: float
    savings_goal: float
    savings_gap: float
    on_track: bool
    breakdown: CategoryBreakdown
    leaks: list[DetectedLeak]


# ── AI output (structured output schema sent to Claude) ───────────────────────


class LeakInsight(BaseModel):
    category: Literal["dining", "shopping", "entertainment", "fixed", "unexpected"]
    title: str
    explanation: str
    monthly_saving: int


class DoNotBuyItem(BaseModel):
    item: str
    reason: str
    estimated_saving: int


class CoachPlan(BaseModel):
    headline: str
    savings_plan_markdown: str
    leaks: list[LeakInsight]
    do_not_buy: list[DoNotBuyItem]


class GateResponse(BaseModel):
    status: Literal["unlocked"]
    analysis: BudgetAnalysis


class PlanResponse(BaseModel):
    analysis: BudgetAnalysis
    plan: CoachPlan
    source: Literal["claude", "mock"]
    model: str | None
