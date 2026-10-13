# AuraFin

Behavioral personal-finance app: life-time currency (₪ → hours of your life), behavioral friction, and an AI coach powered by Claude.

```
supabase/migrations/   PostgreSQL schema + RLS
web/                   React 19 + Vite + Tailwind v4 + Framer Motion + Recharts (Hebrew, RTL)
api/                   FastAPI coach service (Claude, streamed over SSE)
```

## 1. Database (Supabase)

1. Create a project and run `supabase/migrations/0001_aurafin_init.sql` (SQL editor or `supabase db push`).
2. **Authentication → Providers → enable Anonymous sign-ins.** The app signs users in anonymously on first launch, and every table is protected by RLS on `auth.uid()`. Upgrade to email/OAuth later with `supabase.auth.updateUser` / `linkIdentity` without losing data.

`profiles.hourly_rate` is a generated column: `monthly_income / (weekly_work_hours × 52 / 12)`.

## 2. Web app

```bash
cd web
cp .env.example .env      # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or leave empty for local-only mode
npm install
npm run dev               # http://localhost:5173
```

- Without Supabase vars, data lives in `localStorage` (same repository interface: `src/services/repository.js`).
- `VITE_COACH_MODE=mock` (default) uses an offline insight generator; set `live` to stream from the API. The dev server proxies `/api` to `localhost:8000`.
- New users get a sample 30-day ledger (flagged `sample`) so the dashboard is meaningful immediately; “הסרת נתוני הדגמה” wipes it.

## 3. Coach API

```bash
cd api
python -m venv .venv && .venv\Scripts\activate     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                # set ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000 --env-file .env
```

`POST /api/coach/insight` returns `text/event-stream` with events `meta` → `delta`* → `done` | `error`.

Notes:
- Model defaults to `claude-sonnet-5-5` (`claude-3-5-sonnet` was retired in Oct 2025). Override with `AURAFIN_MODEL`.
- All arithmetic (hourly rate, hours traded, months-to-goal) is computed server-side in `app/metrics.py` and handed to the model, so numbers in the insight are exact.
- Uses adaptive thinking at `effort=low` (short banner text) and server-side refusal fallbacks (`fallbacks: "default"`).
- Before production: verify the Supabase JWT on this endpoint (the frontend already sends `Authorization: Bearer <access_token>`) and add rate limiting.
