from .metrics import CoachMetrics
from .schemas import CoachPersona, InsightRequest

PERSONA_VOICES: dict[CoachPersona, str] = {
    "gentle": (
        "Persona: 'המדריך העדין' (Gentle Guide). Warm, validating and non-judgmental. Acknowledge that the urge is "
        "human, celebrate any effort, and frame change as a small, kind experiment. Never guilt or shame."
    ),
    "tough_love": (
        "Persona: 'אהבה קשוחה' (Tough Love, No-BS). Blunt, punchy, short sentences, zero excuses. Name the pattern "
        "directly and make the cost impossible to ignore. Direct is fine; insulting, mocking or demeaning the user is not."
    ),
    "analytical": (
        "Persona: 'הכלכלן האנליטי' (Analytical Financier). Calm and precise. Lead with ratios, trade-offs and "
        "scenarios; let the numbers make the argument. No emotional language beyond what the data justifies."
    ),
}

SYSTEM_TEMPLATE = """You are the AI coach inside AuraFin, a personal finance app that changes spending behavior in the moment rather than logging it after the fact.

Write one coaching insight for the user described in the next message. It will be shown in a small banner on their dashboard, so it has to land in a few seconds of reading.

{persona_voice}

What makes an insight work here:
- Translate money into hours of the user's working life. The figures are pre-computed for you; use them exactly as given and do not invent other numbers.
- Tie the cost to their own dream goal, so the trade-off is concrete: this habit versus that goal, and by how much time.
- Focus on the single biggest impulse trigger rather than listing everything.
- End with one specific action for the next 48 hours, phrased as an implementation intention ("when X happens, I will Y"), small enough to actually do.
- If impulse spending is already low, say so and reinforce what is working instead of inventing a problem.
- Do not recommend specific investment products, stocks or funds; you are a behavior coach, not a licensed financial adviser.

Format: Hebrew only, written naturally for an Israeli reader (use ₪ for amounts). Address the user by first name. Plain text with no markdown, headings, lists or emoji. 3-5 sentences, under 90 words."""


def build_system_prompt(persona: CoachPersona) -> str:
    return SYSTEM_TEMPLATE.format(persona_voice=PERSONA_VOICES[persona])


def _fmt_money(value: float) -> str:
    return f"₪{value:,.0f}"


def _fmt_months(months: int | None) -> str:
    if months is None:
        return "not reachable at the current pace (no monthly surplus)"
    if months == 0:
        return "already reached"
    return f"{months} months"


def build_user_prompt(request: InsightRequest, metrics: CoachMetrics) -> str:
    profile, spending = request.profile, request.spending
    first_name = profile.full_name.strip().split()[0]

    if spending.top_triggers:
        triggers = "\n".join(
            f"  - {t.label}: {_fmt_money(t.amount)} ({t.amount / metrics.hourly_rate:.1f} work hours)"
            for t in spending.top_triggers
        )
    else:
        triggers = "  - (none recorded)"

    return f"""<user_profile>
First name: {first_name}
Net monthly income: {_fmt_money(profile.monthly_income)}
Work hours per week: {profile.weekly_work_hours:g}
Value of one hour of their life (net income per worked hour): ₪{metrics.hourly_rate:,.2f}
Dream goal: {profile.dream_goal} (target {_fmt_money(profile.dream_goal_amount)}, saved so far {_fmt_money(profile.current_savings)})
</user_profile>

<last_{spending.window_days}_days>
Must-have spending: {_fmt_money(spending.must_total)}
Planned fun spending: {_fmt_money(spending.fun_total)}
Impulse spending: {_fmt_money(spending.impulse_total)} across {spending.impulse_count} purchases
Impulse spending in life-time: {metrics.impulse_hours:g} work hours (≈ {metrics.impulse_work_days:g} full work days)
Impulse share of income: {metrics.impulse_share_of_income:.1%}
Impulse by trigger:
{triggers}
</last_{spending.window_days}_days>

<projections>
Monthly surplus at the current pace: {_fmt_money(metrics.monthly_surplus)}
Time to dream goal at the current pace: {_fmt_months(metrics.months_to_goal_current)}
Time to dream goal if impulse spending went to savings instead: {_fmt_months(metrics.months_to_goal_without_impulse)}
Impulse habit annualized: {_fmt_money(metrics.yearly_impulse_cost)} ≈ {metrics.yearly_impulse_hours:g} work hours per year
</projections>

Write the insight now."""
