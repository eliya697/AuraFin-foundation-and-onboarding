"""Deterministic financial metrics. Computed server-side so the model never does arithmetic it could get wrong."""

from dataclasses import dataclass

from .schemas import InsightRequest

WEEKS_PER_MONTH = 52 / 12
MAX_MONTHS = 600


@dataclass(frozen=True)
class CoachMetrics:
    hourly_rate: float
    impulse_hours: float
    impulse_work_days: float
    impulse_share_of_income: float
    monthly_surplus: float
    months_to_goal_current: int | None
    months_to_goal_without_impulse: int | None
    yearly_impulse_cost: float
    yearly_impulse_hours: float


def _months_to_goal(start: float, monthly: float, goal: float) -> int | None:
    if start >= goal:
        return 0
    if monthly <= 0:
        return None
    months = 0
    balance = start
    while balance < goal and months < MAX_MONTHS:
        balance += monthly
        months += 1
    return months if balance >= goal else None


def compute_metrics(request: InsightRequest) -> CoachMetrics:
    profile, spending = request.profile, request.spending
    scale = 30 / spending.window_days  # normalize the window to one month

    hourly_rate = profile.monthly_income / (profile.weekly_work_hours * WEEKS_PER_MONTH)
    monthly_impulse = spending.impulse_total * scale
    monthly_spend = (spending.must_total + spending.fun_total + spending.impulse_total) * scale
    surplus = profile.monthly_income - monthly_spend
    impulse_hours = spending.impulse_total / hourly_rate

    return CoachMetrics(
        hourly_rate=round(hourly_rate, 2),
        impulse_hours=round(impulse_hours, 1),
        impulse_work_days=round(impulse_hours / (profile.weekly_work_hours / 5), 1),
        impulse_share_of_income=round(monthly_impulse / profile.monthly_income, 3),
        monthly_surplus=round(surplus),
        months_to_goal_current=_months_to_goal(profile.current_savings, surplus, profile.dream_goal_amount),
        months_to_goal_without_impulse=_months_to_goal(
            profile.current_savings, surplus + monthly_impulse, profile.dream_goal_amount
        ),
        yearly_impulse_cost=round(monthly_impulse * 12),
        yearly_impulse_hours=round(monthly_impulse * 12 / hourly_rate),
    )
