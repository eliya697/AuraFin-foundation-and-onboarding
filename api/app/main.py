import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from google import genai

from .catalog import get_catalog
from .coach import CoachService
from .config import get_settings
from .errors import validation_exception_handler
from .routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("aurafin")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    get_catalog()  # fail fast if shared/tracks.json is missing or malformed
    # genai.Client() reads GEMINI_API_KEY (or GOOGLE_API_KEY) from the environment.
    client = genai.Client() if settings.use_ai else None
    app.state.coach = CoachService(settings, client)
    app.state.coach_uses_ai = client is not None
    logger.info("Coach engine: %s", f"Gemini ({settings.model})" if client else "offline mock")
    try:
        yield
    finally:
        if client is not None:
            await client.aio.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="AuraFin 2.0 API", version="2.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.include_router(router)
    return app


app = create_app()
