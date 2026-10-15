import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CATALOG = Path(__file__).resolve().parents[2] / "shared" / "tracks.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AURAFIN_", extra="ignore")

    # "auto" uses Gemini when an API key is present and the offline plan generator otherwise.
    coach_mode: Literal["auto", "live", "mock"] = "auto"
    # gemini-1.5-flash and gemini-2.0-flash are shut down; gemini-3.8-flash is the current stable Flash.
    model: str = "gemini-3.8-flash"
    max_tokens: int = 16000
    catalog_path: Path = DEFAULT_CATALOG
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,https://eliya697.github.io"
    # Supabase project used by the web app. When both are set, every API call requires a signed-in user.
    supabase_url: str = ""
    supabase_anon_key: str = ""

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def use_ai(self) -> bool:
        if self.coach_mode == "auto":
            return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
        return self.coach_mode == "live"


@lru_cache
def get_settings() -> Settings:
    return Settings()
