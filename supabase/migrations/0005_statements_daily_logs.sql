-- AuraFin 2.0 · PDF statement imports and daily check-ins (no-spend streaks, micro-tasks)
-- Run after 0004 with `supabase db push`, or paste into the Supabase SQL editor. Re-runnable.
-- RLS is enabled on every table here, as 0003_rls_audit.sql requires. See docs/transactions.md.

begin;

-- ─────────────────────────────────────────────────────────────
-- transactions: rows imported from a PDF statement
-- ─────────────────────────────────────────────────────────────
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check check (source in ('manual', 'csv', 'pdf'));

-- ─────────────────────────────────────────────────────────────
-- daily_logs: one row per user per day
-- ─────────────────────────────────────────────────────────────
-- Same sync contract as transactions / savings_goals (client id, client_updated_at, deleted_at,
-- updated_at). The id is derived on the device from user + date, so two devices checking in on the
-- same day write the same row; the (user_id, log_date) unique key backs that up.
-- Streaks and XP are computed from these rows on the client, so nothing derived is stored.
create table if not exists public.daily_logs (
  id                 uuid primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  log_date           date not null,
  no_spend           boolean,               -- null = not answered yet
  tasks              jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(tasks) = 'object' and pg_column_size(tasks) <= 1024),
  client_updated_at  timestamptz not null default now(),
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint daily_logs_user_date_key unique (user_id, log_date),
  constraint daily_logs_date_check check (log_date >= date '2020-01-01')
);

create index if not exists daily_logs_user_updated_idx
  on public.daily_logs (user_id, updated_at);

drop trigger if exists daily_logs_keep_newest on public.daily_logs;
create trigger daily_logs_keep_newest
  before update on public.daily_logs
  for each row execute function public.keep_newest_client_write();

drop trigger if exists daily_logs_set_updated_at on public.daily_logs;
create trigger daily_logs_set_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

alter table public.daily_logs enable row level security;

drop policy if exists "daily_logs_select_own" on public.daily_logs;
create policy "daily_logs_select_own" on public.daily_logs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "daily_logs_insert_own" on public.daily_logs;
create policy "daily_logs_insert_own" on public.daily_logs
  for insert to authenticated
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

drop policy if exists "daily_logs_update_own" on public.daily_logs;
create policy "daily_logs_update_own" on public.daily_logs
  for update to authenticated
  using ((select auth.uid()) = user_id and not (select public.is_suspended()))
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

drop policy if exists "daily_logs_delete_own" on public.daily_logs;
create policy "daily_logs_delete_own" on public.daily_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.daily_logs to authenticated;

commit;
