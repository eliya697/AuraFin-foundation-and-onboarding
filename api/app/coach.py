import json
import logging
from collections.abc import AsyncIterator
from dataclasses import asdict

import anthropic

from .config import Settings
from .metrics import compute_metrics
from .prompts import build_system_prompt, build_user_prompt
from .schemas import InsightRequest

logger = logging.getLogger("aurafin.coach")

# `fallbacks: "default"` re-runs a safety-declined request on Anthropic's recommended fallback model server-side.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class CoachService:
    def __init__(self, client: anthropic.AsyncAnthropic, settings: Settings) -> None:
        self._client = client
        self._settings = settings

    async def stream_insight(self, request: InsightRequest) -> AsyncIterator[str]:
        """Yields Server-Sent Events: `meta`, then `delta`*, then `done` or `error`."""
        metrics = compute_metrics(request)
        yield sse("meta", {"model": self._settings.model, "metrics": asdict(metrics)})

        try:
            async with self._client.beta.messages.stream(
                model=self._settings.model,
                max_tokens=self._settings.max_tokens,
                system=build_system_prompt(request.profile.coach_persona),
                messages=[{"role": "user", "content": build_user_prompt(request, metrics)}],
                thinking={"type": "adaptive"},
                output_config={"effort": self._settings.effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            ) as stream:
                async for text in stream.text_stream:
                    yield sse("delta", {"text": text})
                final = await stream.get_final_message()
        except anthropic.RateLimitError:
            logger.warning("Claude rate limit hit")
            yield sse("error", {"message": "המאמן עמוס כרגע. נסו שוב בעוד דקה."})
            return
        except anthropic.APIStatusError as exc:
            logger.error("Claude API error %s: %s", exc.status_code, exc.message)
            yield sse("error", {"message": "המאמן לא זמין כרגע. נסו שוב מאוחר יותר."})
            return
        except anthropic.APIConnectionError:
            logger.exception("Could not reach the Claude API")
            yield sse("error", {"message": "אין חיבור לשירות ה-AI. בדקו את החיבור ונסו שוב."})
            return

        if final.stop_reason == "refusal":
            logger.warning("Claude declined the request: %s", final.stop_details)
            yield sse("error", {"message": "לא הצלחנו לייצר תובנה לנתונים האלה. נסו שוב."})
            return

        yield sse(
            "done",
            {
                "model": final.model,
                "stop_reason": final.stop_reason,
                "input_tokens": final.usage.input_tokens,
                "output_tokens": final.usage.output_tokens,
            },
        )
