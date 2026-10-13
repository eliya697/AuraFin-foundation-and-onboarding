from typing import Literal

from pydantic import BaseModel, Field

CoachPersona = Literal["gentle", "tough_love", "analytical"]


class ProfileContext(BaseModel):
    full_name: str = Field(min_length=1, max_length=80)
    monthly_income: float = Field(gt=0, le=10_000_000)
    weekly_work_hours: float = Field(gt=0, le=100)
    current_savings: float = Field(default=0, ge=0)
    currency: str = Field(default="ILS", min_length=3, max_length=3)
    coach_persona: CoachPersona
    dream_goal: str = Field(min_length=1, max_length=120)
    dream_goal_amount: float = Field(gt=0)


class TriggerTotal(BaseModel):
    key: str = Field(max_length=40)
    label: str = Field(max_length=60)
    amount: float = Field(ge=0)


class SpendingContext(BaseModel):
    window_days: int = Field(default=30, ge=1, le=365)
    must_total: float = Field(ge=0)
    fun_total: float = Field(ge=0)
    impulse_total: float = Field(ge=0)
    impulse_count: int = Field(ge=0)
    top_triggers: list[TriggerTotal] = Field(default_factory=list, max_length=10)


class InsightRequest(BaseModel):
    profile: ProfileContext
    spending: SpendingContext
