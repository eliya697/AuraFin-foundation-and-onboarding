"""AI engine: turns a validated FinancialSnapshot into a structured savings plan using Google Gemini.

When no Gemini credentials are configured, build_mock_plan() produces the plan from the same
deterministic analysis, so the API (and the web app's offline fallback) keep working.
"""

import logging

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import ValidationError

from .analysis import analyze
from .catalog import get_catalog
from .config import Settings
from .prompts import SYSTEM_PROMPT, build_user_prompt
from .schemas import BudgetAnalysis, CoachPlan, DoNotBuyItem, FinancialSnapshot, LeakInsight, PlanResponse

logger = logging.getLogger("aurafin.coach")

REQUEST_TIMEOUT_MS = 90_000
BLOCKED_FINISH_REASONS = {
    types.FinishReason.SAFETY,
    types.FinishReason.PROHIBITED_CONTENT,
    types.FinishReason.BLOCKLIST,
    types.FinishReason.SPII,
    types.FinishReason.RECITATION,
}


class CoachUnavailableError(Exception):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _inline_refs(schema: dict) -> dict:
    """Inlines Pydantic's `$defs`/`$ref` so the response schema is a single self-contained object."""
    defs = schema.get("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(defs[node["$ref"].split("/")[-1]])
            return {key: resolve(value) for key, value in node.items() if key != "$defs"}
        if isinstance(node, list):
            return [resolve(item) for item in node]
        return node

    return resolve(schema)


PLAN_SCHEMA = _inline_refs(CoachPlan.model_json_schema())


class CoachService:
    def __init__(self, settings: Settings, client: genai.Client | None) -> None:
        self._settings = settings
        self._client = client

    async def build_plan(self, snapshot: FinancialSnapshot) -> PlanResponse:
        analysis = analyze(snapshot)
        if self._client is None:
            return PlanResponse(analysis=analysis, plan=build_mock_plan(snapshot, analysis), source="mock", model=None)

        plan, model = await self._ask_gemini(snapshot, analysis)
        return PlanResponse(analysis=analysis, plan=plan, source="gemini", model=model)

    async def _ask_gemini(self, snapshot: FinancialSnapshot, analysis: BudgetAnalysis) -> tuple[CoachPlan, str]:
        try:
            response = await self._client.aio.models.generate_content(
                model=self._settings.model,
                contents=build_user_prompt(snapshot, analysis),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_json_schema=PLAN_SCHEMA,
                    max_output_tokens=self._settings.max_tokens,
                    http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
                ),
            )
        except genai_errors.ClientError as exc:
            if exc.code == 429:
                logger.warning("Gemini rate limit / quota hit")
                raise CoachUnavailableError("המאמן עמוס כרגע. נסו שוב בעוד דקה.", 429) from exc
            # 400/401/403/404: bad key, unknown or retired model, invalid request — a configuration problem.
            logger.error("Gemini rejected the request (%s %s): %s", exc.code, exc.status, exc.message)
            raise CoachUnavailableError("המאמן לא זמין כרגע. נסו שוב מאוחר יותר.") from exc
        except genai_errors.ServerError as exc:
            logger.error("Gemini server error (%s): %s", exc.code, exc.message)
            raise CoachUnavailableError("המאמן לא זמין כרגע. נסו שוב מאוחר יותר.") from exc
        except httpx.HTTPError as exc:
            logger.exception("Could not reach the Gemini API")
            raise CoachUnavailableError("אין חיבור לשירות ה-AI. נסו שוב.") from exc

        feedback = response.prompt_feedback
        if feedback is not None and feedback.block_reason:
            logger.warning("Gemini blocked the prompt: %s", feedback.block_reason)
            raise CoachUnavailableError("לא הצלחנו לבנות תוכנית לנתונים האלה. נסו שוב.", 502)

        candidate = response.candidates[0] if response.candidates else None
        finish = candidate.finish_reason if candidate else None
        if finish in BLOCKED_FINISH_REASONS:
            logger.warning("Gemini stopped the plan for safety/recitation: %s", finish)
            raise CoachUnavailableError("לא הצלחנו לבנות תוכנית לנתונים האלה. נסו שוב.", 502)
        if finish == types.FinishReason.MAX_TOKENS:
            logger.error("Plan output hit max_output_tokens")
            raise CoachUnavailableError("התוכנית נקטעה באמצע. נסו שוב.", 502)

        try:
            plan = CoachPlan.model_validate_json(response.text or "")
        except ValidationError as exc:
            logger.error("Gemini returned output that does not match CoachPlan: %s", exc)
            raise CoachUnavailableError("התקבלה תשובה לא תקינה מהמאמן. נסו שוב.", 502) from exc

        usage = response.usage_metadata
        logger.info(
            "Plan generated by %s (in=%s out=%s)",
            response.model_version or self._settings.model,
            usage.prompt_token_count if usage else None,
            usage.candidates_token_count if usage else None,
        )
        return plan, response.model_version or self._settings.model


def _money(value: float) -> str:
    return f"₪{value:,.0f}"


def build_mock_plan(snapshot: FinancialSnapshot, analysis: BudgetAnalysis) -> CoachPlan:
    """Offline plan generated from the deterministic analysis (used when no Gemini credentials are configured)."""
    catalog = get_catalog()
    track = catalog.tracks[snapshot.profile.track_id]
    variable = snapshot.variable

    overspends = [leak for leak in analysis.leaks if leak.kind == "overspend"]
    focus_key = overspends[0].category if overspends else max(
        ("dining", "shopping", "entertainment"), key=lambda key: getattr(variable, key)
    )
    focus_label = catalog.field_labels[focus_key]
    focus_amount = getattr(variable, focus_key)
    focus_target = round(min(focus_amount, snapshot.income * track.benchmarks[focus_key]))
    weekly = round(focus_target / 4.3)

    if analysis.projected_savings < 0:
        picture = (
            f"ההוצאות המתוכננות ({_money(analysis.total_expenses)}) גבוהות מההכנסה ב־{_money(-analysis.projected_savings)}. "
            "לפני שמדברים על חיסכון — מייצבים את החודש."
        )
    elif analysis.on_track:
        picture = (
            f"מעולה: צפויים להישאר לכם {_money(analysis.projected_savings)} בסוף החודש, "
            f"מעל היעד של {track.name} ({_money(analysis.savings_goal)}). נשמור על זה."
        )
    else:
        picture = (
            f"בסוף החודש צפויים להישאר {_money(analysis.projected_savings)}, "
            f"ויעד המסלול הוא {_money(analysis.savings_goal)} — חסרים {_money(-analysis.savings_gap)}."
        )

    if analysis.children_count:
        picture += (
            f" עם {analysis.children_count} ילדים, כרית הבלת\"מים המומלצת היא לפחות {_money(analysis.reserve_target)} בחודש."
        )

    markdown = f"""## התמונה הכוללת
{picture}

## התוכנית לחודש הקרוב
- תקציב שבועי ל{focus_label}: **{_money(weekly)}** (במקום כ־{_money(focus_amount / 4.3)}).
- ביום קבלת המשכורת מעבירים **{_money(max(analysis.savings_goal, 0))}** לחשבון חיסכון נפרד — לפני שמתחילים להוציא.
- שומרים את {_money(snapshot.unexpected)} של הבלת"מים בצד, ולא נוגעים בהם לקניות.

## ההרגל שמשנה הכול
כשמתחשק לכם {focus_label} — אז מחכים 10 דקות ובודקים כמה נשאר מהתקציב השבועי."""

    leaks = [
        LeakInsight(
            category=leak.category,
            title=f"{leak.label} מעל הרף של המסלול" if leak.kind == "overspend" else "רשת הבלת\"מים דקה מדי",
            explanation=(
                f"{_money(leak.amount)} בחודש הם {leak.share_of_income * 100:.0f}% מההכנסה, "
                f"כשהרף ב{track.name} הוא {leak.benchmark_share * 100:.0f}%."
            ),
            monthly_saving=int(leak.excess_amount),
        )
        for leak in analysis.leaks[:4]
    ]
    if not leaks:
        leaks.append(
            LeakInsight(
                category=focus_key,
                title=f"לשים עין על {focus_label}",
                explanation=f"זו ההוצאה המשתנה הגדולה שלכם ({_money(focus_amount)}). כרגע בתוך הרף — שווה לשמור.",
                monthly_saving=0,
            )
        )

    catalog_items = {
        "dining": [("משלוח באמצע השבוע", "ארוחה מהבית עולה כשליש", 0.3), ("קפה ומאפה בדרך לעבודה", "תרמוס מהבית עושה את העבודה", 0.15)],
        "shopping": [("קנייה ב'מבצע' שלא תכננתם", "מבצע הוא סיבה לקנות, לא צורך", 0.35), ("עוד פריט אופנה החודש", "הארון לא יברח", 0.2)],
        "entertainment": [("מנוי סטרימינג נוסף", "בחרו אחד ובטלו את השאר החודש", 0.15), ("יציאה ספונטנית שנייה בשבוע", "יציאה אחת מתוכננת שווה יותר", 0.3)],
    }
    ordered = [focus_key] + [key for key in ("dining", "shopping", "entertainment") if key != focus_key]
    do_not_buy = [
        DoNotBuyItem(item=item, reason=reason, estimated_saving=round(getattr(variable, key) * share))
        for key in ordered
        for item, reason, share in catalog_items[key]
    ][:5]

    return CoachPlan(
        headline=f"החודש: תקציב שבועי של {_money(weekly)} ל{focus_label}",
        savings_plan_markdown=markdown,
        leaks=leaks,
        do_not_buy=do_not_buy,
    )
