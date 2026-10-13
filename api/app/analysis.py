"""Deterministic budget analysis. The AI explains these numbers; it never computes them."""

from .catalog import get_catalog
from .schemas import BudgetAnalysis, CategoryBreakdown, DetectedLeak, FinancialSnapshot


def analyze(snapshot: FinancialSnapshot) -> BudgetAnalysis:
    catalog = get_catalog()
    track = catalog.tracks[snapshot.profile.track_id]
    income = snapshot.income
    fixed, variable = snapshot.fixed, snapshot.variable

    breakdown = CategoryBreakdown(
        fixed=fixed.rent + fixed.electricity + fixed.water + fixed.municipal,
        variable=variable.dining + variable.shopping,
        entertainment=variable.entertainment,
        unexpected=snapshot.unexpected,
    )
    total = breakdown.fixed + breakdown.variable + breakdown.entertainment + breakdown.unexpected
    projected = income - total
    goal = round(income * track.savings_rate)

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
                    share_of_income=round(amount / income, 4),
                    benchmark_share=benchmark,
                    excess_amount=round(amount - income * benchmark),
                    kind="overspend",
                )
            )

    min_reserve = income * track.min_unexpected_share
    if snapshot.unexpected < min_reserve:
        leaks.append(
            DetectedLeak(
                category="unexpected",
                label=catalog.field_labels["unexpected"],
                amount=snapshot.unexpected,
                share_of_income=round(snapshot.unexpected / income, 4),
                benchmark_share=track.min_unexpected_share,
                excess_amount=round(min_reserve - snapshot.unexpected),
                kind="under_reserved",
            )
        )

    leaks.sort(key=lambda leak: leak.excess_amount, reverse=True)

    return BudgetAnalysis(
        track_id=track.id,
        track_name=track.name,
        total_expenses=round(total),
        projected_savings=round(projected),
        savings_rate=round(projected / income, 4),
        savings_goal=goal,
        savings_gap=round(projected - goal),
        on_track=projected >= goal,
        breakdown=breakdown,
        leaks=leaks,
    )
