"""Deterministic budget analysis. The AI explains these numbers; it never computes them.

Mirrored in web/src/lib/analysis.js for the offline fallback; shared/fixtures/analysis_cases.json
pins both implementations to identical output (tests/test_analysis_parity.py and the web parity test).
"""

from decimal import ROUND_HALF_UP, Decimal

from .catalog import get_catalog
from .schemas import BudgetAnalysis, CategoryBreakdown, DetectedLeak, FinancialSnapshot


def round_half_up(value: float, digits: int = 0) -> float:
    """Rounds .5 away from zero (Python's round() is banker's rounding, JS Math.round is not)."""
    quantum = Decimal(1).scaleb(-digits)
    return float(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def analyze(snapshot: FinancialSnapshot) -> BudgetAnalysis:
    catalog = get_catalog()
    track = catalog.tracks[snapshot.profile.track_id]
    income = snapshot.income
    fixed, variable = snapshot.fixed, snapshot.variable
    children_count = snapshot.profile.children_count if snapshot.profile.has_children else 0

    breakdown = CategoryBreakdown(
        fixed=fixed.rent + fixed.electricity + fixed.water + fixed.municipal,
        variable=variable.dining + variable.shopping,
        entertainment=variable.entertainment,
        unexpected=snapshot.unexpected,
        children=snapshot.children_expenses,
        custom=sum(item.amount for item in snapshot.custom_expenses),
    )
    total = (
        breakdown.fixed
        + breakdown.variable
        + breakdown.entertainment
        + breakdown.unexpected
        + breakdown.children
        + breakdown.custom
    )
    projected = income - total
    goal = round_half_up(income * track.savings_rate)

    leaks: list[DetectedLeak] = []
    for category in ("dining", "shopping", "entertainment"):
        amount = getattr(variable, category)
        benchmark = track.benchmarks[category]
        if amount > income * benchmark:
            leaks.append(
                DetectedLeak(
                    category=category,
                    label=catalog.field_labels[category],
                    amount=amount,
                    share_of_income=round_half_up(amount / income, 4),
                    benchmark_share=benchmark,
                    excess_amount=round_half_up(amount - income * benchmark),
                    kind="overspend",
                )
            )

    # Every child raises the minimum unexpected-costs reserve, up to a cap.
    reserve_share = round_half_up(
        track.min_unexpected_share + min(children_count * catalog.reserve_boost_per_child, catalog.reserve_boost_max),
        4,
    )
    reserve_target = round_half_up(income * reserve_share)
    if snapshot.unexpected < income * reserve_share:
        leaks.append(
            DetectedLeak(
                category="unexpected",
                label=catalog.field_labels["unexpected"],
                amount=snapshot.unexpected,
                share_of_income=round_half_up(snapshot.unexpected / income, 4),
                benchmark_share=reserve_share,
                excess_amount=round_half_up(income * reserve_share - snapshot.unexpected),
                kind="under_reserved",
            )
        )

    leaks.sort(key=lambda leak: leak.excess_amount, reverse=True)

    return BudgetAnalysis(
        track_id=track.id,
        track_name=track.name,
        total_expenses=round_half_up(total),
        projected_savings=round_half_up(projected),
        savings_rate=round_half_up(projected / income, 4),
        savings_goal=goal,
        savings_gap=round_half_up(projected - goal),
        on_track=projected >= goal,
        children_count=children_count,
        reserve_target=reserve_target,
        breakdown=breakdown,
        leaks=leaks,
    )
