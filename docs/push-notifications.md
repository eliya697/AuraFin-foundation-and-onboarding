# Push notifications — follow-up proposal

Status: **proposal, nothing built**. It builds on the transactions layer (docs/transactions.md) and
needs decisions and secrets from the project owner before any code is written.

## What users get

| Notification | Trigger | Example (Hebrew copy) |
|---|---|---|
| Budget line nearing its plan | A line's actual spend this month first crosses 80% of its planned amount | "אוכל בחוץ: ניצלתם 80% מהתקציב החודשי" |
| Budget line over plan | First crossing of 100% | "קניות: עברתם את התכנון החודשי ב-₪120" |
| Goal milestone | A savings goal crosses 25 / 50 / 75 / 100% | "קרן חירום: חצי מהדרך! 🎯" |
| Goal falling behind | A goal's projection switches to `behind` (see lib/goals.js) | "טיול ליפן: כדי לעמוד בתאריך צריך ₪900 בחודש" |
| Monthly summary (opt-in) | The 1st of the month, 09:00 Israel time | "ספטמבר: חסכתם ₪2,400 — 3 סעיפים מעל התכנון" |

Every type gets its own toggle, and all are off until the user opts in. Each notification fires at most
once per line or goal per period. Quiet hours are 22:00–08:00 Israel time.

## Architecture

```
 device (PWA)                        Supabase
 ─────────────                       ─────────────────────────────────────────────
 Account → "התראות" toggle           push_subscriptions (RLS own rows)
   Notification.requestPermission()  notification_prefs  (RLS own rows)
   pushManager.subscribe(VAPID pub)  notification_log    (no client access)
   upsert subscription  ───────────▶
                                     pg_cron (every 15 min) ──▶ pg_net POST
 sw.js                                 ──▶ Edge Function `send-notifications`
   'push' → showNotification()            reads transactions, savings_goals, journeys.state.budget
   'notificationclick' → focus/open       decides who crosses a threshold, dedupes via notification_log
                     ◀──────────────────  sends Web Push (VAPID-signed) to each subscription
                                          410/404 → delete the dead subscription
```

### 1. VAPID key pair (owner action)
- Generate the key pair once with `npx web-push generate-vapid-keys`.
- The public key goes into the web build as `VITE_VAPID_PUBLIC_KEY` (it's public, the same as the anon key).
- The private key and the contact subject (`mailto:` address) are stored as **Supabase secrets only**:
  `supabase secrets set VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…`. They never go in the repo or in a
  `VITE_` variable.

### 2. Database (new migration, e.g. 0005_push_notifications.sql)
- `push_subscriptions(id uuid pk, user_id → auth.users, endpoint text unique, p256dh text, auth text,
  user_agent text, created_at, last_success_at, failure_count int)`
- `notification_prefs(user_id pk → auth.users, budget_alerts bool, goal_alerts bool,
  monthly_summary bool, quiet_hours bool default true, updated_at)`
- `notification_log(user_id, kind, subject_key, period_key, sent_at, primary key (user_id, kind,
  subject_key, period_key))`. This table is the dedupe ledger and is not readable by clients.
- RLS on all three. Clients get own-row access to subscriptions and prefs, and no access to the log.
  **The security branch's `0003_rls_audit.sql` fails if any public table lacks RLS**, so the
  migration has to enable it on every table it creates.
- `pg_cron` + `pg_net` jobs call the Edge Function with the service-role key.

### 3. Edge Function `send-notifications` (Deno)
- Runs on the schedule above with the service-role key, because it reads every opted-in user's data.
- For each opted-in user with a live subscription it:
  - computes this month's actuals from `transactions` (the same logic as
    `web/src/lib/analytics.js`);
  - reads the plans from `journeys.state.budget`;
  - computes goal projections the same way as `web/src/lib/goals.js`.
- The pure aggregation and projection code is easiest to share by moving it to `shared/` (Vite
  already aliases `@shared`) and importing it into the function.
- It sends with the `web-push` npm package through Deno's `npm:` specifier, or with a small VAPID
  JWT signer.
- On 404 or 410 it deletes the subscription; on other failures it increments `failure_count`.
- Notifications that would land in quiet hours are queued until 08:00.

### 4. Client
- **Service worker:** `web/public/sw.js` gets `push` and `notificationclick` handlers. Today it only
  caches. Changing it means bumping `CACHE_VERSION` so devices pick up the new worker. Clicking a
  notification focuses or opens the dashboard at the right section.
- **Account screen:** a "התראות" (notifications) card with the per-type toggles. Permission is
  requested only when the user turns on a toggle, never on load.
- **iOS:** Web Push works only in the **installed** PWA (iOS 16.4+). The card explains this and
  links to the existing install banner flow (`InstallBanner.jsx`).
- **Privacy:** respect the theme branch's Privacy Eye. If amounts are hidden in the app, the
  notification text leaves them out too ("עברתם את התכנון החודשי").
- On sign-out, unsubscribe and delete the device's subscription row.

## Testing
- Unit tests (Vitest and Deno test) for threshold detection, dedupe keys, quiet hours and the
  410 cleanup.
- An end-to-end test on a Supabase branch database:
  - insert transactions that cross 80%;
  - invoke the function;
  - assert one `notification_log` row and one send, using a mocked push endpoint;
  - invoke it again and assert nothing new is sent.
- A manual check on Android Chrome and on an installed iOS PWA.

## Open questions for the owner
1. Which notification types to ship first? The budget-line alerts alone are the smallest useful slice.
2. Run every 15 minutes, or once a day? Daily is cheaper, but alerts arrive later.
3. Which contact email to use for the VAPID subject?
4. Is it OK to move `analytics.js` / `goals.js` aggregation into `shared/` so the client and the
   function use the same code?

## Rough size
- About 1 day for the migration, the Edge Function and its tests.
- About 1 day for the service worker and the account UI.
- Half a day for device testing.

Shipping it needs `supabase secrets set`, `supabase functions deploy`, a cron migration, and a web build
with `VITE_VAPID_PUBLIC_KEY`.
