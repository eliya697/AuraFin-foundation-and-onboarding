import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CATALOG = Path(__file__).resolve().parents[2] / "shared" / "tracks.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AURAFIN_", extra="ignore")

    # "auto" uses Claude when credentials are present and the offline plan generator otherwise.
    coach_mode: Literal["auto", "live", "mock"] = "auto"
    model: str = "claude-sonnet-5-5"
    effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    max_tokens: int = 16000
    catalog_path: Path = DEFAULT_CATALOG
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def use_claude(self) -> bool:
        if self.coach_mode == "auto":
            return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
        return self.coach_mode == "live"


@lru_cache
def get_settings() -> Settings:
    return Settings()
