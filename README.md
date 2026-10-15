# AuraFin 2.0

Bright, Hebrew-first (RTL) behavioral finance coach. A mandatory journey (Welcome → Profile Quiz → Expense Gate) collects a full monthly budget, then Google Gemini builds a personal savings plan, leak report and "Do Not Buy" list.

```
shared/tracks.json   Single source of truth: life stages, goals, tracks, benchmarks, field rules (read by web + api)
web/                 React 19 + Vite + Tailwind v4 + Framer Motion + Recharts + Supabase Auth
api/                 FastAPI: gate validation, deterministic analysis, Gemini plan generation, session check
supabase/            SQL migrations: roles, per-user journeys, admin RPCs (RLS)
```

## Accounts, admin and data sync

Every screen sits behind sign-in (`web/src/App.jsx` → `Guarded`). Each user gets their own journey,
stored on the device (`localStorage`, key `aurafin:v3:journey:<userId>`) **and** in Supabase
(`public.journeys`). On start the newer copy (by `updatedAt`) wins; edits are saved locally at once and
pushed to the cloud after a short debounce, retried with backoff, and flushed when the app goes to the
background. Nothing is uploaded before the first cloud fetch succeeds, so an outdated phone can never
overwrite newer data. The top bar shows the sync state (נשמר / שומר… / לא מקוון / השמירה נכשלה).

**Setup (once):**

1. Create a Supabase project. In the SQL editor run `supabase/migrations/0001_aurafin_init.sql` and
   `0002_auth_roles_journeys.sql` (or `supabase db push`).
2. Auth → URL configuration: add `https://eliya697.github.io/AuraFin-foundation-and-onboarding/` (and
   `http://localhost:5173/` for dev) to the redirect URLs, so confirmation and password-reset links work.
3. Build with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `web/.env.example`). Set the same
   values as `AURAFIN_SUPABASE_URL` / `AURAFIN_SUPABASE_ANON_KEY` on the API host to require a valid,
   non-suspended session on `/api/gate/validate` and `/api/coach/plan` (`api/app/auth.py`).
4. Sign up with **eliyamistriel1234@gmail.com** and confirm the email: the `admin_emails` allow-list makes
   that account an admin (an account that already exists is upgraded by the migration's backfill).

**Roles.** Regular users can read and write only their own journey (RLS). Admins (confirmed email, role
`admin`, not suspended) get the **ניהול** tab: every user with stage, track and income; a detail sheet
with the full journey; promote/demote admins, suspend/unsuspend, and reset a user's journey. These go
through `security definer` RPCs (`admin_list_users`, `admin_set_role`, `admin_set_suspended`,
`admin_reset_journey`) that re-check `is_admin()` on the server; admins cannot demote or suspend
themselves. Suspended users see a notice and cannot write data or call the API.

Without Supabase settings, `npm run dev` uses a **browser-only dev login** (`services/backend/localBackend.js`,
never included in production builds); signing up with the admin email there makes a local admin.

## Mobile behaviour

- **Back button** (`lib/backNavigation.js`): one guard history entry catches Android's hardware/gesture
  back. Back closes the open dialog, then goes to the previous gate/quiz step, then leaves an edit or a
  sub-screen; on the home screen it asks before exiting (a second back press exits).
- **Crash isolation**: `ErrorBoundary` wraps the app, each stage, each dashboard section and the plan,
  so a failure shows a retry card instead of a white screen.
- **Editing**: "עדכון נתונים" / "עריכת פרופיל" keep a snapshot so "ביטול" restores the dashboard
  untouched; saving re-verifies and the plan is regenerated for the new numbers.
- **Layout**: bottom tab bar on phones (top nav on desktop), `env(safe-area-inset-*)` on every edge,
  48×48 px minimum touch targets, no `backdrop-filter`/filter animations, transform-only animations,
  memoised inputs and charts, `content-visibility` for long lists.

## Run

```bash
# API (terminal 1)
cd api
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                                 # optional: set GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000 --env-file .env

# Web (terminal 2)
cd web
npm install
npm run dev                                          # http://localhost:5173, proxies /api → :8000
```

### Deploying (GitHub Pages) and offline mode

`npm run deploy` (in `web/`) publishes to https://eliya697.github.io/AuraFin-foundation-and-onboarding/. GitHub Pages cannot run the API, so:

- **No `VITE_API_URL` at build time** → the static app never calls `/api` (GitHub Pages would answer 405). The gate validates with the same rules client-side, analysis runs in the browser (`web/src/lib/analysis.js`), and the dashboard shows a local plan with a "מצב לא מקוון" badge.
- **`VITE_API_URL=https://your-api.example.com npm run deploy`** → uses a hosted API (allow the Pages origin via `AURAFIN_ALLOWED_ORIGINS`, already included by default). If it is unreachable (network error, timeout, 404/405/500/502/503/504 that isn't a JSON response from our API), the app falls back to offline mode and keeps re-checking in the background; once the server answers, the badge turns to "הנתונים אומתו". A 422 validation error, 401 or 403 is never bypassed. The app pings `/api/health` on start so a sleeping free-tier host is awake by the time the gate submits.

In offline mode the gate is enforced by the client only; with a backend, the server remains the authority.

### Installable PWA

- `web/public/manifest.webmanifest` pins `id`, `start_url` and `scope` to `/AuraFin-foundation-and-onboarding/` and lists `any` + `maskable` PNG icons at 192 and 512; `index.html` links it via `%BASE_URL%`.
- `src/pwa/installPrompt.js` captures `beforeinstallprompt` at module load (Chrome can fire it before React mounts); `components/InstallBanner.jsx` shows an "התקנת האפליקציה" button that calls `prompt()`, or Share → "הוספה למסך הבית" instructions on iOS Safari. Hidden when running installed; a dismissal is remembered for 14 days.
- **Deploy with `npm run deploy`** (it runs `gh-pages -d dist --dotfiles`, so `.nojekyll` is published too). Changes here only reach phones after a deploy. After deploying, an already-open tab may need one reload so the new service worker takes over.
- `web/public/sw.js` is registered in production builds only (`src/registerServiceWorker.js`): network-first for the page, cache-first for hashed assets and icons, stale-while-revalidate for Google Fonts. It never caches `/api/*` or the GitHub OTA check. Bump `CACHE_VERSION` when changing its caching rules.
- Icons live in `web/public/icons/` (SVG sources + PNG renders at 192, 512, maskable 512 and the 180px `apple-touch-icon` for iOS). If you change the SVGs, re-render the PNGs at the same sizes.

With no `GEMINI_API_KEY`, `AURAFIN_COACH_MODE=auto` serves an offline plan built from the same analysis (the dashboard shows a "מצב הדגמה" badge). Set the key (from https://aistudio.google.com/apikey) to use Gemini. The default model is `gemini-3.8-flash`; `gemini-1.5-flash` and `gemini-2.0-flash` have been shut down by Google. Override with `AURAFIN_MODEL`.

## The mandatory journey

| Stage | Component | Leaves when |
|---|---|---|
| Welcome | `WelcomeScreen.jsx` | "מתחילים את המסע" |
| Quiz | `OnboardingQuiz.jsx` | life stage + goal answered and a track explicitly selected |
| Gate | `MandatoryExpenseGate.jsx` | every step valid (children step for parents; custom rows need a title and amount) **and** `POST /api/gate/validate` returns 200 — or, with no reachable API, local validation passes |
| Dashboard | `Dashboard.jsx` | — |

Enforcement is layered:

1. **UI** — each gate sub-step blocks "המשך" until its fields are valid: red highlight, shake, friendly banner, focus on the first problem.
2. **State guard** — `resolveStage()` in `web/src/state/JourneyContext.jsx` derives the stage from data on every render. The dashboard renders only if the budget is complete *and* the server unlocked that exact snapshot (fingerprint match). Editing or tampering with stored data re-locks it.
3. **Server** — `FinancialSnapshot` (`api/app/schemas.py`) is strict: every field required, no unknown fields, real numbers only, income and בלת"מים must be > 0, the track must exist, children data must be consistent (`has_children` ⇔ `children_count ≥ 1` ⇔ `children_expenses > 0`), and each of up to 20 `custom_expenses` needs a 1–40 character title and a positive amount. Errors return 422 with per-field Hebrew messages (`api/app/errors.py`) that the gate maps back onto inputs. `/api/coach/plan` re-validates with the same contract, so no incomplete data ever reaches the AI.

## AI engine

- `api/app/analysis.py` computes totals (including children and custom items), projected end-of-month savings, the track's savings goal, and leaks (dining/shopping/entertainment above the track benchmark, or a בלת"מים reserve below its minimum — which rises 1% of income per child, capped at +4%). The model explains these numbers; it never computes them.
- `web/src/lib/analysis.js` is a port of the same engine for offline mode. `shared/fixtures/analysis_cases.json` pins both to identical output; regenerate it with `python scripts/update_analysis_fixtures.py` after an intentional rule change.
- `api/app/prompts.py` sends the exact figures plus the flagged leaks; `api/app/coach.py` calls Gemini (`google-genai` SDK, `client.aio.models.generate_content`) with a JSON response schema derived from `CoachPlan` (headline, Markdown savings plan, leaks, Do-Not-Buy list) and validates the reply with Pydantic. Rate limits, retired models, server errors, network failures, safety blocks, truncation and malformed JSON all map to clean JSON errors, so the web client never mistakes them for "offline".

## Tests

```bash
cd api && pytest -q      # gate contract, children/custom rules, prompt content, Gemini request shape + failure modes, fixtures
cd web && npm test       # JS analysis engine vs the shared fixtures, journey model, back stack, update-data regression
```

Covers the gate contract (missing/blank/string/negative/oversized values, zero reserve, unknown track, extra fields), the plan endpoint's re-validation, mock mode, and the exact Gemini request shape and failure handling (via a stubbed client, no API spend).

## Note

`supabase/migrations/0001_aurafin_init.sql` is the v1 schema (`profiles`, `transactions`, `ai_insights`); 2.0 uses `0002_auth_roles_journeys.sql`.
