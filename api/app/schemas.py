"""Request/response contracts.

FinancialSnapshot is the server-side enforcer of the Mandatory Expense Gate: every field is
required (no defaults), unknown fields are rejected, values must be real JSON numbers, and
income and the unexpected-costs reserve must be positive. Children data must be internally
consistent and every custom expense needs a title and a positive amount. An incomplete
snapshot never reaches the AI engine.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator
from pydantic_core import PydanticCustomError

from .catalog import get_catalog

_catalog = get_catalog()
MAX_AMOUNT = _catalog.max_amount
MAX_CHILDREN = _catalog.max_children
MAX_CUSTOM_EXPENSES = _catalog.max_custom_expenses

LifeStage = Literal["student", "employee", "freelancer", "young_family"]
PrimaryGoal = Literal["house", "debt", "safety_net"]

Amount = Annotated[float, Field(ge=0, le=MAX_AMOUNT, allow_inf_nan=False)]
PositiveAmount = Annotated[float, Field(gt=0, le=MAX_AMOUNT, allow_inf_nan=False)]
ExpenseTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=_catalog.max_custom_title_length)
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class FinancialProfile(StrictModel):
    life_stage: LifeStage
    primary_goal: PrimaryGoal
    track_id: str
    has_children: bool
    children_count: Annotated[int, Field(ge=0, le=MAX_CHILDREN)]

    @field_validator("track_id")
    @classmethod
    def track_must_exist(cls, value: str) -> str:
        if value not in get_catalog().tracks:
            raise ValueError("unknown_track")
        return value

    @model_validator(mode="after")
    def children_count_matches_answer(self) -> "FinancialProfile":
        if self.has_children and self.children_count < 1:
            raise PydanticCustomError("children_count_missing", "children_count must be at least 1 when has_children")
        if not self.has_children and self.children_count != 0:
            raise PydanticCustomError("children_count_unexpected", "children_count must be 0 when has_children is false")
        return self


class FixedExpenses(StrictModel):
    rent: Amount
    electricity: Amount
    water: Amount
    municipal: Amount


class VariableExpenses(StrictModel):
    entertainment: Amount
    dining: Amount
    shopping: Amount


class CustomExpense(StrictModel):
    title: ExpenseTitle
    amount: PositiveAmount


class FinancialSnapshot(StrictModel):
    profile: FinancialProfile
    income: PositiveAmount
    fixed: FixedExpenses
    variable: VariableExpenses
    unexpected: PositiveAmount
    children_expenses: Amount
    custom_expenses: Annotated[list[CustomExpense], Field(max_length=MAX_CUSTOM_EXPENSES)]

    @model_validator(mode="after")
    def children_expenses_match_profile(self) -> "FinancialSnapshot":
        if self.profile.has_children and self.children_expenses <= 0:
            raise PydanticCustomError("children_expenses_required", "children_expenses must be positive when has_children")
        if not self.profile.has_children and self.children_expenses != 0:
            raise PydanticCustomError("children_expenses_unexpected", "children_expenses must be 0 without children")
        return self


# ── Analysis (deterministic, computed in analysis.py) ─────────────────────────


class CategoryBreakdown(BaseModel):
    fixed: float
    variable: float
    entertainment: float
    unexpected: float
    children: float
    custom: float


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
    children_count: int
    reserve_target: float
    breakdown: CategoryBreakdown
    leaks: list[DetectedLeak]


# ── AI output (structured output schema sent to Gemini) ───────────────────────


class LeakInsight(BaseModel):
    category: Literal["dining", "shopping", "entertainment", "fixed", "unexpected", "children", "custom"]
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
    source: Literal["gemini", "mock"]
    model: str | None
