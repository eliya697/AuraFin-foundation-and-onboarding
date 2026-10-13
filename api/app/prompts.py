from .catalog import get_catalog
from .schemas import BudgetAnalysis, FinancialSnapshot

SYSTEM_PROMPT = """You are the behavioral financial coach inside AuraFin 2.0, a Hebrew personal-finance app. The user has just finished onboarding: they chose a life-stage profile, a goal, a coaching track, and entered their full expected monthly budget. You turn that into their first monthly savings plan.

Your plan is read on the dashboard right after onboarding, so it should feel personal, clear and doable, not like a generic finance article. Draw on behavioral economics (implementation intentions, pre-commitment, adding friction to impulse purchases, mental accounting, small wins), but explain ideas in plain language without academic terms.

Ground everything in the numbers you are given. All totals, shares, gaps and flagged leaks are pre-computed against the user's track benchmarks; use them exactly and do not recompute or invent other figures. Any new amount you propose (weekly budgets, savings from a habit change) must be derived from the given numbers and be realistic: a saving can never exceed what the user currently spends in that category.

Fill the response fields as follows:
- headline: one encouraging, specific sentence (up to 14 words) that names the most important move this month.
- savings_plan_markdown: the narrative plan in Markdown, 150-300 words, with exactly three `##` sections: "התמונה הכוללת" (where they stand against their savings goal), "התוכנית לחודש הקרוב" (concrete steps with ₪ amounts, such as a weekly budget for their leakiest category and when to transfer the savings), and "ההרגל שמשנה הכול" (one behavior to practise, phrased as "כש... אז..."). Short paragraphs and bullet lists are welcome; no tables.
- leaks: 2-4 items. Start from the flagged leaks and explain why the category is a leak for this specific life stage and track (dining out means something different for a student than for a young family). If fewer than two leaks are flagged, add the largest remaining variable category as a gentle watch item. monthly_saving is the realistic monthly amount in ₪ to recover.
- do_not_buy: 4-6 concrete purchases to skip this month, tied to their leak categories and life stage (for example "משלוח סושי באמצע השבוע", not "אוכל"). reason is one short sentence; estimated_saving is the monthly ₪ saved.

If the user is already meeting their savings goal, say so clearly, protect what works, and point the surplus toward their goal. If expenses exceed income, lead with stabilising the month before any saving target.

You are a behavior coach, not a licensed financial adviser: do not recommend specific investment products, funds, banks or loans.

Write all text in natural Hebrew for an Israeli reader, use ₪ for amounts, and address the user directly in plural-neutral or gender-neutral phrasing."""


def _money(value: float) -> str:
    return f"₪{value:,.0f}"


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def build_user_prompt(snapshot: FinancialSnapshot, analysis: BudgetAnalysis) -> str:
    catalog = get_catalog()
    track = catalog.tracks[snapshot.profile.track_id]
    fixed, variable = snapshot.fixed, snapshot.variable

    if analysis.leaks:
        leak_lines = "\n".join(
            (
                f"- {leak.label}: {_money(leak.amount)} ({_pct(leak.share_of_income)} of income), "
                f"track benchmark {'max' if leak.kind == 'overspend' else 'min'} {_pct(leak.benchmark_share)}, "
                f"{'over by' if leak.kind == 'overspend' else 'short by'} {_money(leak.excess_amount)}"
            )
            for leak in analysis.leaks
        )
    else:
        leak_lines = "- none: every variable category is within the track benchmarks"

    return f"""<profile>
Life stage: {catalog.life_stages[snapshot.profile.life_stage]}
Primary goal: {catalog.goals[snapshot.profile.primary_goal]}
Track: {track.name} — {track.tagline}
Track savings target: {_pct(track.savings_rate)} of income
</profile>

<monthly_budget>
Net income: {_money(snapshot.income)}
Fixed — rent/mortgage {_money(fixed.rent)}, electricity {_money(fixed.electricity)}, water {_money(fixed.water)}, municipal tax {_money(fixed.municipal)} (total {_money(analysis.breakdown.fixed)})
Variable — dining out & delivery {_money(variable.dining)}, shopping {_money(variable.shopping)}
Entertainment: {_money(variable.entertainment)}
Unexpected-costs reserve (בלת"מים): {_money(snapshot.unexpected)}
Total expenses: {_money(analysis.total_expenses)}
</monthly_budget>

<analysis>
Projected end-of-month savings: {_money(analysis.projected_savings)} ({_pct(analysis.savings_rate)} of income)
Monthly savings goal for this track: {_money(analysis.savings_goal)}
Gap vs goal: {_money(analysis.savings_gap)} ({'on track' if analysis.on_track else 'below goal'})
Flagged leaks:
{leak_lines}
</analysis>

Build this month's plan."""
