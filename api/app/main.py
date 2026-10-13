import logging
from contextlib import asynccontextmanager

import anthropic
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .coach import CoachService
from .config import get_settings
from .routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = anthropic.AsyncAnthropic()
    app.state.coach = CoachService(client, settings)
    try:
        yield
    finally:
        await client.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="AuraFin Coach API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(router)
    return app


app = create_app()
