-- AuraFin 2.0 · transactions (actuals) and savings goals
-- Numbered 0004: the security branch adds 0003_rls_audit.sql. Every table here enables RLS, as that audit requires.
-- Run after 0002 with `supabase db push`, or paste into the Supabase SQL editor. Re-runnable.
--
-- 0001 tied transactions/ai_insights to public.profiles, which 2.0 users never get (their data lives
-- in public.journeys, keyed by auth.users), so every insert failed the foreign key. This migration
-- re-points both tables at auth.users and adds the columns the 2.0 client syncs. See docs/transactions.md.
--
-- Sync contract (both tables):
--   id                 generated on the device, so retried writes are idempotent upserts on id
--   client_updated_at  last edit on the device; an older write never overwrites a newer one
--   deleted_at         soft delete (tombstone) so deletions reach the user's other devices
--   updated_at         server time of the last accepted write; clients pull rows changed since

begin;

-- ─────────────────────────────────────────────────────────────
-- Foreign keys: profiles → auth.users
-- ─────────────────────────────────────────────────────────────
alter table public.transactions drop constraint if exists transactions_user_id_fkey;
alter table public.transactions
  add constraint transactions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.ai_insights drop constraint if exists ai_insights_user_id_fkey;
alter table public.ai_insights
  add constraint ai_insights_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

-- ─────────────────────────────────────────────────────────────
-- transactions: 2.0 columns
-- ─────────────────────────────────────────────────────────────
drop view if exists public.monthly_category_totals;

-- The 1.0 must/impulse/fun enum becomes an optional mood tag.
alter table public.transactions alter column category drop not null;

alter table public.transactions
  add column if not exists kind              text not null default 'expense',
  add column if not exists budget_key        text not null default 'other',
  add column if not exists note              text not null default '',
  add column if not exists source            text not null default 'manual',
  add column if not exists import_hash       text,
  add column if not exists client_updated_at timestamptz not null default now(),
  add column if not exists updated_at        timestamptz not null default now(),
  add column if not exists deleted_at        timestamptz;

alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in ('expense', 'income'));

-- A budget line from the user's journey (rent, dining, …), custom:<id>, 'other' or 'income'.
alter table public.transactions drop constraint if exists transactions_budget_key_check;
alter table public.transactions add constraint transactions_budget_key_check
  check (budget_key ~ '^([a-z_]{1,40}|custom:[A-Za-z0-9_-]{1,64})$');

alter table public.transactions drop constraint if exists transactions_note_check;
alter table public.transactions add constraint transactions_note_check check (char_length(note) <= 280);

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check check (source in ('manual', 'csv'));

alter table public.transactions drop constraint if exists transactions_import_hash_check;
alter table public.transactions add constraint transactions_import_hash_check
  check (import_hash is null or char_length(import_hash) between 8 and 128);

-- CSV dedupe: one row per import fingerprint per user (tombstones included, so a deleted import
-- is not re-imported by accident).
create unique index if not exists transactions_user_import_hash_key
  on public.transactions (user_id, import_hash) where import_hash is not null;

create index if not exists transactions_user_updated_idx
  on public.transactions (user_id, updated_at);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- Last-writer-wins by device time: a replayed or late write older than the stored row is dropped
-- silently (returning null skips the row). Fires before set_updated_at (triggers run by name).
create or replace function public.keep_newest_client_write()
returns trigger
language plpgsql
as $$
begin
  if new.client_updated_at < old.client_updated_at then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_keep_newest on public.transactions;
create trigger transactions_keep_newest
  before update on public.transactions
  for each row execute function public.keep_newest_client_write();

-- Writes also require a non-suspended account, like journeys.
drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id and not (select public.is_suspended()))
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

grant select, insert, update, delete on public.transactions to authenticated;

-- Monthly rollup without the profiles join (respects caller RLS).
create view public.monthly_category_totals
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_at) as month,
  t.kind,
  t.budget_key,
  count(*)      as tx_count,
  sum(t.amount) as total_amount
from public.transactions t
where t.deleted_at is null
group by t.user_id, date_trunc('month', t.occurred_at), t.kind, t.budget_key;

grant select on public.monthly_category_totals to authenticated;

-- ─────────────────────────────────────────────────────────────
-- savings_goals
-- ─────────────────────────────────────────────────────────────
create table if not exists public.savings_goals (
  id                 uuid primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null check (char_length(trim(name)) between 1 and 60),
  target             numeric(14, 2) not null check (target > 0),
  saved              numeric(14, 2) not null default 0 check (saved >= 0),
  deadline           date,
  client_updated_at  timestamptz not null default now(),
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists savings_goals_user_updated_idx
  on public.savings_goals (user_id, updated_at);

drop trigger if exists savings_goals_keep_newest on public.savings_goals;
create trigger savings_goals_keep_newest
  before update on public.savings_goals
  for each row execute function public.keep_newest_client_write();

drop trigger if exists savings_goals_set_updated_at on public.savings_goals;
create trigger savings_goals_set_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

alter table public.savings_goals enable row level security;

drop policy if exists "savings_goals_select_own" on public.savings_goals;
create policy "savings_goals_select_own" on public.savings_goals
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "savings_goals_insert_own" on public.savings_goals;
create policy "savings_goals_insert_own" on public.savings_goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

drop policy if exists "savings_goals_update_own" on public.savings_goals;
create policy "savings_goals_update_own" on public.savings_goals
  for update to authenticated
  using ((select auth.uid()) = user_id and not (select public.is_suspended()))
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

drop policy if exists "savings_goals_delete_own" on public.savings_goals;
create policy "savings_goals_delete_own" on public.savings_goals
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.savings_goals to authenticated;

commit;
