-- AuraFin · core schema
-- Run with `supabase db push` or paste into the Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'coach_persona') then
    create type public.coach_persona as enum ('gentle', 'tough_love', 'analytical');
  end if;
  if not exists (select 1 from pg_type where typname = 'transaction_category') then
    create type public.transaction_category as enum ('must', 'impulse', 'fun');
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- Shared trigger: keep updated_at fresh
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  full_name                text not null check (char_length(trim(full_name)) between 2 and 80),
  monthly_income           numeric(12, 2) not null check (monthly_income > 0),
  weekly_work_hours        numeric(5, 2) not null default 42 check (weekly_work_hours > 0 and weekly_work_hours <= 100),
  hourly_rate              numeric(10, 2) generated always as (
                             round(monthly_income / (weekly_work_hours * 52.0 / 12.0), 2)
                           ) stored,
  current_savings          numeric(14, 2) not null default 0 check (current_savings >= 0),
  currency                 char(3) not null default 'ILS',
  coach_persona            public.coach_persona not null default 'gentle',
  dream_goal               text not null check (char_length(trim(dream_goal)) between 2 and 120),
  dream_goal_amount        numeric(14, 2) not null check (dream_goal_amount > 0),
  impulse_triggers         text[] not null default '{}',
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on column public.profiles.hourly_rate is
  'Net income per worked hour: monthly_income / (weekly_work_hours * 52 / 12). Used for life-time currency conversion.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- transactions
-- ─────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  amount       numeric(12, 2) not null check (amount > 0),
  category     public.transaction_category not null,
  merchant     text not null default '' check (char_length(merchant) <= 120),
  trigger_key  text,
  occurred_at  timestamptz not null default now(),
  flags        text[] not null default '{}'
               check (flags <@ array['flagged_impulse', 'late_night', 'friction_confirmed', 'recurring', 'sample']::text[]),
  created_at   timestamptz not null default now()
);

create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);

create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category, occurred_at desc);

-- ─────────────────────────────────────────────────────────────
-- ai_insights
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ai_insights (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  persona         public.coach_persona not null,
  model           text not null,
  content         text not null check (char_length(content) > 0),
  context         jsonb not null default '{}'::jsonb,
  input_tokens    integer check (input_tokens >= 0),
  output_tokens   integer check (output_tokens >= 0),
  rating          smallint check (rating between -1 and 1),
  created_at      timestamptz not null default now()
);

create index if not exists ai_insights_user_created_idx
  on public.ai_insights (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Monthly rollup view (respects caller RLS)
-- ─────────────────────────────────────────────────────────────
create or replace view public.monthly_category_totals
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_at) as month,
  t.category,
  count(*)                           as tx_count,
  sum(t.amount)                      as total_amount,
  round(sum(t.amount) / nullif(p.hourly_rate, 0), 2) as hours_of_life
from public.transactions t
join public.profiles p on p.id = t.user_id
group by t.user_id, date_trunc('month', t.occurred_at), t.category, p.hourly_rate;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.transactions enable row level security;
alter table public.ai_insights  enable row level security;

-- profiles: a user sees and edits only their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- transactions
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ai_insights: users read, insert and rate their own insights
drop policy if exists "ai_insights_select_own" on public.ai_insights;
create policy "ai_insights_select_own" on public.ai_insights
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "ai_insights_insert_own" on public.ai_insights;
create policy "ai_insights_insert_own" on public.ai_insights
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "ai_insights_update_own" on public.ai_insights;
create policy "ai_insights_update_own" on public.ai_insights
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_insights_delete_own" on public.ai_insights;
create policy "ai_insights_delete_own" on public.ai_insights
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.monthly_category_totals to authenticated;

commit;
