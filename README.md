# AuraFin 2.0

Bright, Hebrew-first (RTL) behavioral finance coach. A mandatory journey (Welcome → Profile Quiz → Expense Gate) collects a full monthly budget, then Claude builds a personal savings plan, leak report and "Do Not Buy" list.

```
shared/tracks.json   Single source of truth: life stages, goals, tracks, benchmarks, field rules (read by web + api)
web/                 React 19 + Vite + Tailwind v4 + Framer Motion + Recharts
api/                 FastAPI: gate validation, deterministic analysis, Claude plan generation
```

## Run

```bash
# API (terminal 1)
cd api
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                                 # optional: set ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000 --env-file .env

# Web (terminal 2)
cd web
npm install
npm run dev                                          # http://localhost:5173, proxies /api → :8000
```

With no `ANTHROPIC_API_KEY`, `AURAFIN_COACH_MODE=auto` serves an offline plan built from the same analysis (the dashboard shows a "מצב הדגמה" badge). Set the key to use Claude (`claude-sonnet-5-5` by default; `claude-3-5-sonnet` is retired).

## The mandatory journey

| Stage | Component | Leaves when |
|---|---|---|
| Welcome | `WelcomeScreen.jsx` | "מתחילים את המסע" |
| Quiz | `OnboardingQuiz.jsx` | life stage + goal answered and a track explicitly selected |
| Gate | `MandatoryExpenseGate.jsx` | all 9 fields valid **and** `POST /api/gate/validate` returns 200 |
| Dashboard | `Dashboard.jsx` | — |

Enforcement is layered:

1. **UI** — each gate sub-step blocks "המשך" until its fields are valid: red highlight, shake, friendly banner, focus on the first problem.
2. **State guard** — `resolveStage()` in `web/src/state/JourneyContext.jsx` derives the stage from data on every render. The dashboard renders only if the budget is complete *and* the server unlocked that exact snapshot (fingerprint match). Editing or tampering with stored data re-locks it.
3. **Server** — `FinancialSnapshot` (`api/app/schemas.py`) is strict: every field required, no unknown fields, real numbers only, income and בלת"מים must be > 0, the track must exist. Errors return 422 with per-field Hebrew messages (`api/app/errors.py`) that the gate maps back onto inputs. `/api/coach/plan` re-validates with the same contract, so no incomplete data ever reaches the AI.

## AI engine

- `api/app/analysis.py` computes totals, projected end-of-month savings, the track's savings goal, and leaks (dining/shopping/entertainment above the track benchmark, or a בלת"מים reserve below its minimum). The model explains these numbers; it never computes them.
- `api/app/prompts.py` sends the exact figures plus the flagged leaks; `api/app/coach.py` calls Claude with structured outputs (`CoachPlan`: headline, Markdown savings plan, leaks, Do-Not-Buy list), adaptive thinking, and server-side refusal fallbacks.

## Tests

```bash
cd api && pytest -q
```

Covers the gate contract (missing/blank/string/negative/oversized values, zero reserve, unknown track, extra fields), the plan endpoint's re-validation, mock mode, and the exact Claude request shape (via a mocked transport, no API spend).

## Note

`supabase/migrations/0001_aurafin_init.sql` is the v1 schema and is not used by 2.0, which currently persists the journey in `localStorage`.
