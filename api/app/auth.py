"""Supabase session verification for the API.

When AURAFIN_SUPABASE_URL and AURAFIN_SUPABASE_ANON_KEY are set, every /api call except /health
must carry `Authorization: Bearer <access token>` from a signed-in, non-suspended user. Tokens are
checked against Supabase itself (`/auth/v1/user`), which works for every JWT signing method, and
the user's own `user_roles` row is read with their token (RLS allows reading your own row).
Results are cached briefly so a burst of calls costs one round-trip.

Without those settings (local development, tests) authentication is not enforced.
"""

import hashlib
import logging
import time
from dataclasses import dataclass

import httpx
from fastapi import HTTPException, Request

from .config import Settings

logger = logging.getLogger("aurafin.auth")

CACHE_TTL_SECONDS = 60
CACHE_MAX_ENTRIES = 2048
UNAUTHORIZED = "נדרשת התחברות. התחברו מחדש ונסו שוב."
SUSPENDED = "החשבון הושעה על ידי מנהל המערכת."
UNAVAILABLE = "שירות ההתחברות לא זמין כרגע. נסו שוב בעוד רגע."


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str
    role: str
    suspended: bool


class SupabaseVerifier:
    def __init__(self, url: str, anon_key: str, transport: httpx.AsyncBaseTransport | None = None):
        self._client = httpx.AsyncClient(base_url=url.rstrip("/"), timeout=10.0, transport=transport)
        self._anon_key = anon_key
        self._cache: dict[str, tuple[float, AuthUser]] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    async def verify(self, token: str) -> AuthUser:
        key = hashlib.sha256(token.encode()).hexdigest()
        cached = self._cache.get(key)
        now = time.monotonic()
        if cached and cached[0] > now:
            return cached[1]

        headers = {"apikey": self._anon_key, "Authorization": f"Bearer {token}"}
        try:
            user_response = await self._client.get("/auth/v1/user", headers=headers)
            if user_response.status_code in (401, 403):
                raise HTTPException(status_code=401, detail=UNAUTHORIZED)
            user_response.raise_for_status()
            data = user_response.json()
            role_response = await self._client.get(
                "/rest/v1/user_roles",
                params={"select": "role,suspended", "user_id": f"eq.{data['id']}"},
                headers=headers,
            )
            role_response.raise_for_status()
            rows = role_response.json()
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            logger.warning("Supabase verification failed: %s", exc)
            raise HTTPException(status_code=503, detail=UNAVAILABLE) from exc

        row = rows[0] if rows else {}
        user = AuthUser(
            id=data["id"],
            email=data.get("email") or "",
            role="admin" if row.get("role") == "admin" else "user",
            suspended=bool(row.get("suspended")),
        )
        if len(self._cache) >= CACHE_MAX_ENTRIES:
            self._cache.clear()
        self._cache[key] = (now + CACHE_TTL_SECONDS, user)
        return user


def create_verifier(settings: Settings) -> SupabaseVerifier | None:
    if settings.supabase_url and settings.supabase_anon_key:
        return SupabaseVerifier(settings.supabase_url, settings.supabase_anon_key)
    return None


async def require_user(request: Request) -> AuthUser | None:
    """FastAPI dependency. Returns the caller, or None when auth is not configured."""
    verifier: SupabaseVerifier | None = getattr(request.app.state, "verifier", None)
    if verifier is None:
        return None
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail=UNAUTHORIZED)
    user = await verifier.verify(token.strip())
    if user.suspended:
        raise HTTPException(status_code=403, detail=SUSPENDED)
    return user
