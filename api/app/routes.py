from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from .coach import CoachService
from .schemas import InsightRequest

router = APIRouter(prefix="/api")


def get_coach(request: Request) -> CoachService:
    return request.app.state.coach


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/coach/insight")
async def coach_insight(payload: InsightRequest, coach: CoachService = Depends(get_coach)) -> StreamingResponse:
    return StreamingResponse(
        coach.stream_insight(payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
