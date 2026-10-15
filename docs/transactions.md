# Transactions layer — design note

Status: scope approved. Steps 1–3 built (migration 0003, CRUD + list UI, offline outbox, CSV import); steps 4–5 pending.

## Why a migration is needed first

`public.transactions` (0001) has `user_id → public.profiles(id)`. AuraFin 2.0 never creates
`profiles` rows (user data lives in `public.journeys`, keyed by `auth.users`), so **every insert
from a 2.0 user would fail the FK**. The `monthly_category_totals` view inner-joins `profiles` and
would return nothing. Nothing in `web/` or `api/` reads or writes the table today, so it can be
reshaped safely.

`0003_transactions_goals.sql` (additive, idempotent, re-runnable):

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
   Code: `web/src/lib/csvImport.js`, `web/src/features/transactions/CsvImportDialog.jsx`.

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

1. Migration 0003, plus transactions CRUD in both backends and a simple list/add UI (online-only path).
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
