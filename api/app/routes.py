from fastapi import APIRouter, Depends, HTTPException, Request

from .analysis import analyze
from .coach import CoachService, CoachUnavailableError
from .schemas import FinancialSnapshot, GateResponse, PlanResponse

router = APIRouter(prefix="/api")


def get_coach(request: Request) -> CoachService:
    return request.app.state.coach


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    return {"status": "ok", "coach": "claude" if request.app.state.coach_uses_claude else "mock"}


@router.post("/gate/validate", response_model=GateResponse)
async def validate_gate(snapshot: FinancialSnapshot) -> GateResponse:
    """The Mandatory Expense Gate. A 200 here is the only thing that unlocks the dashboard.

    Incomplete or malformed data is rejected with 422 and per-field messages (see errors.py).
    """
    return GateResponse(status="unlocked", analysis=analyze(snapshot))


@router.post("/coach/plan", response_model=PlanResponse)
async def coach_plan(snapshot: FinancialSnapshot, coach: CoachService = Depends(get_coach)) -> PlanResponse:
    """Re-validates the full snapshot (same contract as the gate) before any AI call is made."""
    try:
        return await coach.build_plan(snapshot)
    except CoachUnavailableError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
