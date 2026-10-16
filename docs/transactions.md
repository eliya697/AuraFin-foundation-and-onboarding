# Transactions layer — design note

Status: scope approved. Steps 1–5 built (migration 0004, CRUD + list UI, offline outbox, CSV import, analytics, savings goals). Push notifications: see docs/push-notifications.md (proposal only).

## Why a migration is needed first

`public.transactions` (0001) has `user_id → public.profiles(id)`. AuraFin 2.0 never creates
`profiles` rows (user data lives in `public.journeys`, keyed by `auth.users`), so **every insert
from a 2.0 user would fail the FK**. The `monthly_category_totals` view inner-joins `profiles` and
would return nothing. Nothing in `web/` or `api/` reads or writes the table today, so it can be
reshaped safely.

`0004_transactions_goals.sql` (additive, idempotent, re-runnable):

- Re-point `transactions.user_id` (and `ai_insights.user_id`) at `auth.users(id) on delete cascade`.
- Add the columns the 2.0 client needs (below); relax the old `category` enum column to nullable
  (kept as an optional "must / impulse / fun" mood tag, unused in the first version of the UI).
- Write policies also require `not public.is_suspended()`, same as journeys.
- Replace `monthly_category_totals` with a view that doesn't join `profiles`.
- New table `public.savings_goals`.

## Data model

```
transactions
  id                uuid  PK — generated on the client (crypto.randomUUID), so retries are idempotent
  user_id           uuid  → auth.users
  kind              text  'expense' | 'income'
  amount            numeric(12,2) > 0           (direction comes from kind)
  budget_key        text  which budget line it counts against (see below)
  merchant          text  ≤ 120
  note              text  ≤ 280
  occurred_at       timestamptz                  (date of the charge)
  source            text  'manual' | 'csv'
  import_hash       text  null for manual; CSV dedupe key; unique (user_id, import_hash)
  client_updated_at timestamptz                  last edit on the device (LWW)
  deleted_at        timestamptz                  soft delete = tombstone that syncs across devices
  created_at / updated_at

savings_goals
  id uuid (client), user_id, name ≤ 60, target > 0, saved ≥ 0, deadline date null,
  client_updated_at, deleted_at, created_at, updated_at
```

## How transactions relate to the budget

The budget snapshot in the journey stays the **plan**. Transactions are the **actuals**.
`budget_key` is one of the budget lines the user already filled in at the gate:

| budget_key | Label |
|---|---|
| `rent`, `electricity`, `water`, `municipal` | fixed expenses |
| `children` | children (parents only) |
| `entertainment`, `dining`, `shopping` | variable expenses |
| `unexpected` | unplanned (בלת"מים) |
| `custom:<id>` | one of the user's custom expenses |
| `other` | not planned in the budget |
| `income` | income (kind = 'income') |

If a custom expense is later deleted from the budget, its transactions are shown under "other". Nothing gets rewritten.

## What the dashboard shows

New sections under the existing dashboard. The existing cards stay unchanged.

1. **החודש** (this month): income vs. spent so far vs. the planned budget, plus a per-line
   "planned / actual" list where lines over plan are highlighted.
2. **תנועות** (transactions): the latest transactions with a quick-add sheet (amount, budget line, merchant,
   date, note), plus edit and delete. Also a CSV import button and a pending-sync count.
3. **ניתוח** (analysis), lazy-loaded with Recharts: monthly trend (expenses and income for the last 6–12 months) and a
   category breakdown for a chosen month.
4. **יעדי חיסכון** (savings goals): each goal shows a progress bar and its projected completion date.

## Sync & offline

- **Local-first.** The device keeps its own copy of transactions and goals in IndexedDB
  (`aurafin` database, `transactions`, `goals` and `outbox` stores), so the UI renders from IndexedDB
  immediately, the same way the journey renders from localStorage.
- **Outbox.** Each mutation is `{ id: client uuid, entity, op: 'upsert'|'delete', row, queuedAt }`.
  Later mutations on the same row collapse into one queue entry. The outbox is replayed on app start, on `online`,
  and after each change (debounced), with the same backoff constants as `JourneyContext`.
- **Idempotent writes.** Writes upsert on `id`. A delete is an upsert that sets `deleted_at`, so a
  replayed mutation is harmless.
- **Pull.** On start and reconnect, the app fetches rows where `updated_at > last pull` and merges
  them into the local copy, newest `client_updated_at` wins. This is the same rule as `chooseJourney`.
- **Badge.** `SyncBadge` gets a "N ממתינים" (N pending) count from the outbox. Its existing looks stay the same.
- `localBackend.js` (dev) implements the same CRUD methods on top of localStorage.
- Code: `web/src/services/sync/localStore.js` (IndexedDB, in-memory fallback) and
  `web/src/services/sync/syncEngine.js` (entity-generic, reused by savings goals).
- Known limit: a row the server rejects permanently (e.g. a constraint violation) keeps the whole batch
  retrying with backoff (badge shows "error · N pending"). Client-side validation makes this rare;
  CSV import avoids the unique-index case with deterministic ids (see CSV import, point 7).

## CSV import (Hebrew bank and credit-card exports)

1. Pick a file. Decode it as UTF-8 (BOM-aware); if the result contains U+FFFD, decode it again as `windows-1255`.
2. Detect the delimiter (`,` `;` or tab) and find the header row. Bank exports often have a few title lines
   before the header, so the importer picks the first row with ≥ 3 non-empty cells that look like headers.
3. **Column mapping.** The importer guesses columns from Hebrew and English headers (תאריך / תאריך עסקה,
   שם בית העסק / תיאור, סכום / סכום חיוב / חובה / זכות …). The user confirms or changes the mapping.
   Two layouts are supported: a single signed amount column, or separate debit and credit columns.
4. **Preview** with per-row errors (bad date or amount). Dates are parsed as `dd/mm/yyyy`, `dd.mm.yy` or ISO, and amounts accept `₪`,
   thousands separators and `-`/parentheses for negatives.
5. **Dedupe.** `import_hash = sha256(date | amount | normalized merchant | occurrence index)`.
   The occurrence index keeps two genuinely identical charges on the same day. Rows already
   imported are flagged in the preview and skipped.
6. Budget line per row: the line the user last chose for the same merchant (learned from their
   transactions, no separate rules table), else a line whose name appears in the merchant as whole words
   ("חברת החשמל" → חשמל), else `other`. Rows can be reassigned in the preview, then are queued
   through the outbox in one batch.
7. As built: the row id is derived from `sha256(userId | import_hash)`, so importing the same file on
   two offline devices converges on the same rows (upsert on id) instead of hitting the
   `(user_id, import_hash)` unique index. Rows matching a hand-typed transaction (same date,
   direction, amount) are flagged "possibly entered manually" and start unselected.
   Code: `web/src/lib/csvImport.js`, `web/src/lib/pdfStatement.js`, `web/src/lib/categorize.js`, `web/src/lib/budgetSuggestion.js`, `web/src/features/transactions/StatementImportDialog.jsx`, `web/src/features/transactions/BankStatementUploader.jsx`.

## PDF statements, auto-categorization and the smart budget (as built)

Migration `supabase/migrations/0005_statements_daily_logs.sql` (run after 0004) allows `source = 'pdf'`.

1. **Drop zone.** `BankStatementUploader.jsx` takes a `.csv` or `.pdf` by drag-and-drop or tap; the
   whole import dialog (`StatementImportDialog.jsx`) is a lazy chunk, and pdf.js (+ its worker) is a
   further chunk fetched only when a PDF is opened. Files are read on the device only.
2. **PDF → rows** (`lib/pdfStatement.js`). pdf.js text items are regrouped into visual lines and cells
   (Hebrew pages are read right to left). Every line with a date and at least one amount with agorot
   (`1,234.50`, `-42.00`, `42.00-`, `(42.00)`) becomes a row `[date, description, amount, amount2,
   amount3]`; reference numbers (5+ digits) and total lines are dropped. The rows get a synthetic
   header, so the CSV mapping / preview / dedupe / outbox steps above run unchanged. Scanned PDFs
   (no text layer) and password-protected PDFs get a Hebrew explanation.
3. **Auto-categorization** (`lib/categorize.js`). After the learned merchant → line and the line-name
   match, keyword rules map merchants to the standard lines: housing → rent, bills → electricity /
   water / municipal, groceries → shopping, restaurants & delivery → dining, streaming / cinema →
   entertainment, kids → children. Categories without a built-in line (transport, telecom) land on a
   custom expense whose name fits (e.g. "רכב") or stay "other". Guessed rows are counted
   ("N סווגו אוטומטית") and stay editable.
4. **Editable preview.** Each row can be fixed inline (date, description, amount, direction).
   A valid row keeps the fingerprint of its file line (re-importing still dedupes); a row that was
   broken gets a fingerprint from its corrected content + line number.
5. **Smart budget** (`lib/budgetSuggestion.js`). After an import, the average monthly spending per
   line over the covered months (a running month is left out unless it is the only one) is compared
   with the plan; lines ≥ ₪20 and 5% away, and the income average, are offered with checkboxes.
   "עדכון התקציב" opens the budget gate pre-filled (edit_start + budget_changed), so the user reviews
   the numbers and the plan is re-verified; cancel restores the old budget.

## Daily check-in, no-spend streaks and the daily allowance (as built)

`lib/habits.js` (pure) + `state/HabitsContext.jsx` + `features/habits/DailyCheckInWidget.jsx`.

- **Table** `public.daily_logs` (migration 0005): one row per user per day — `log_date`,
  `no_spend` (null = not answered), `tasks` jsonb (`review`, `allowance`, `cash`), the same sync
  columns and RLS (own rows; writes blocked while suspended) as `savings_goals`. The id is derived
  from user + date, so two devices checking in on one day write the same row. Synced through the
  outbox as entity `daily_logs` (IndexedDB v2 adds the store).
- **Streak**: consecutive answered no-spend days; an unanswered today keeps yesterday's streak alive,
  a "spent" answer or any expense transaction on that day breaks it. Best streak drives the badges
  (1 / 3 / 7 / 14 / 30 days).
- **XP** (derived, never stored): +5 for answering, +25 for a no-spend day, +10 per micro-task, +15
  for all three; a level every 200 XP. "Log a cash expense" is ticked automatically by a manual
  transaction dated today.
- **Daily allowance**: flexible money = income − committed lines (rent, bills, children, custom
  items, the unexpected reserve) − the monthly savings goal. Today's allowance = (flexible − this
  month's flexible spending before today − committed-line overruns) ÷ days left including today.
  Status `ok` / `tight` (< 60% of the daily average) / `over` / `empty`, shown as feedback badges.

## Analytics (as built)

`web/src/lib/analytics.js` (pure) + `web/src/features/analytics/AnalyticsPanel.jsx` (lazy chunk).
A month picker drives three things: income / expenses / net for the month, a six-month income-vs-
expenses trend ending at that month (grouped bars, time right-to-left), and spending per budget line
as horizontal bars with a tick at the planned amount, plus a planned-vs-actual table (lines over plan
get an icon + "מעל התכנון"). More than 7 lines fold into "שאר הסעיפים" in the chart; the table
keeps them all. Colours were validated with the dataviz palette checker: light expenses `#1f4fd1`,
income `#00a3aa`, plan tick `#7c8db5`; dark (theme branch surface `#13213a`) `#5b82f0` / `#00a3aa` /
`#8a9ab8`, scoped as CSS variables with a `:root[data-theme='dark']` override.

Note: the existing donut chart imports Recharts statically, so Recharts is still part of the
Dashboard chunk. Lazy-loading the panel keeps the analytics code out of it, but Recharts itself
only leaves the first dashboard load if the donut is lazy-loaded too.

## Savings goals

- Progress is `saved / target`.
- **Monthly savings** is the average net amount (income − expenses) over the last 3 complete months of
  transactions. Without enough history, it falls back to the budget's planned remainder
  (`previewTotals().remaining`).
- **Projected completion** is `now + ceil((target − saved) / monthlySavings)` months. When that date is past the deadline, the goal shows "behind schedule"
  with the monthly amount needed to make it. If monthly savings is ≤ 0, the goal shows "לא צפוי להסתיים בקצב הנוכחי"
  (not expected to finish at the current pace).
- Goals are stored in their own table, not the journey, so the
  plan and gate fingerprint are unaffected.

## Build order (each step: Vitest for the pure logic + `npm test` + `npm run build` + api `pytest`)

1. Migration 0004, plus transactions CRUD in both backends and a simple list/add UI (online-only path).
2. IndexedDB outbox and local cache, replay, pending count in SyncBadge.
3. CSV import: decoding, header detection, mapping, preview, dedupe, then queue.
4. Analytics with lazy-loaded Recharts.
5. Savings goals with projection.

## Out of scope / follow-up

- **Push notifications** (for example, "you passed 80% of the dining budget"). These need a VAPID key pair, a
  `push_subscriptions` table, a `push` handler in the service worker, and a scheduled sender
  (a Supabase Edge Function plus `pg_cron`). Written up as a separate proposal; not built here.
- Automatic categorisation beyond saved merchant rules (for example, AI suggestions through the API).
- Multi-currency.
- `api/` stays unchanged: the client talks to Supabase directly under RLS.
