-- AuraFin 2.0 · authentication, roles and per-user journeys
-- Run after 0001 with `supabase db push`, or paste into the Supabase SQL editor.
--
-- Model:
--   user_roles   one row per auth user (created by trigger): role 'user' | 'admin', suspended flag.
--   journeys     one row per user: the whole client journey state (profile, budget, unlock, plan).
--   admin_emails allow-list of emails that become admins on sign-up. Not readable by clients.
--
-- Regular users can read only their own role and read/write only their own journey.
-- Admins (confirmed email + role 'admin' + not suspended) can read every journey, reset journeys
-- and manage roles/suspensions through the admin_* RPCs below.

begin;

-- ─────────────────────────────────────────────────────────────
-- Admin allow-list
-- ─────────────────────────────────────────────────────────────
create table if not exists public.admin_emails (
  email text primary key check (email = lower(email))
);
alter table public.admin_emails enable row level security; -- no policies: invisible to clients

insert into public.admin_emails (email) values ('eliyamistriel1234@gmail.com')
on conflict (email) do nothing;

-- ─────────────────────────────────────────────────────────────
-- user_roles
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'user' check (role in ('user', 'admin')),
  suspended   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when exists (select 1 from public.admin_emails a where a.email = lower(new.email)) then 'admin' else 'user' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill users that signed up before this migration.
insert into public.user_roles (user_id, role)
select u.id,
       case when exists (select 1 from public.admin_emails a where a.email = lower(u.email)) then 'admin' else 'user' end
from auth.users u
on conflict (user_id) do update
  set role = case when excluded.role = 'admin' then 'admin' else public.user_roles.role end;

-- ─────────────────────────────────────────────────────────────
-- Helpers (security definer so RLS policies can call them without recursion)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    where r.user_id = (select auth.uid())
      and r.role = 'admin'
      and not r.suspended
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.suspended from public.user_roles r where r.user_id = (select auth.uid())), false);
$$;

-- ─────────────────────────────────────────────────────────────
-- journeys
-- ─────────────────────────────────────────────────────────────
create table if not exists public.journeys (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  state              jsonb not null default '{}'::jsonb check (pg_column_size(state) < 262144),
  stage              text not null default 'welcome'
                     check (stage in ('welcome', 'quiz', 'gate', 'dashboard')),
  client_updated_at  timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists journeys_set_updated_at on public.journeys;
create trigger journeys_set_updated_at
  before update on public.journeys
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.user_roles enable row level security;
alter table public.journeys   enable row level security;

-- user_roles: read your own row; admins read all. Writes only through the admin RPCs / trigger.
drop policy if exists "user_roles_select_own_or_admin" on public.user_roles;
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- journeys: own row (unless suspended); admins can read any row and reset it via admin_reset_journey.
drop policy if exists "journeys_select_own_or_admin" on public.journeys;
create policy "journeys_select_own_or_admin" on public.journeys
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "journeys_insert_own" on public.journeys;
create policy "journeys_insert_own" on public.journeys
  for insert to authenticated
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

drop policy if exists "journeys_update_own" on public.journeys;
create policy "journeys_update_own" on public.journeys
  for update to authenticated
  using ((select auth.uid()) = user_id and not (select public.is_suspended()))
  with check ((select auth.uid()) = user_id and not (select public.is_suspended()));

drop policy if exists "journeys_delete_own" on public.journeys;
create policy "journeys_delete_own" on public.journeys
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────
-- Admin RPCs
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_list_users()
returns table (
  id                 uuid,
  email              text,
  created_at         timestamptz,
  last_sign_in_at    timestamptz,
  email_confirmed    boolean,
  role               text,
  suspended          boolean,
  stage              text,
  journey_updated_at timestamptz,
  income             numeric,
  track_id           text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.email::text,
           u.created_at,
           u.last_sign_in_at,
           u.email_confirmed_at is not null,
           coalesce(r.role, 'user'),
           coalesce(r.suspended, false),
           j.stage,
           j.client_updated_at,
           nullif(j.state #>> '{budget,income}', '')::numeric,
           j.state #>> '{profile,trackId}'
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    left join public.journeys j on j.user_id = u.id
    order by u.created_at desc;
end;
$$;

create or replace function public.admin_set_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'invalid role %', new_role using errcode = '22023';
  end if;
  if target = (select auth.uid()) and new_role <> 'admin' then
    raise exception 'admins cannot demote themselves' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role) values (target, new_role)
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.admin_set_suspended(target uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if target = (select auth.uid()) then
    raise exception 'admins cannot suspend themselves' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, suspended) values (target, value)
  on conflict (user_id) do update set suspended = excluded.suspended;
end;
$$;

-- Resets a user's journey to empty with a fresh timestamp, so their devices adopt the reset on next
-- load instead of re-uploading their older local copy.
create or replace function public.admin_reset_journey(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into public.journeys (user_id, state, stage, client_updated_at)
  values (target, '{}'::jsonb, 'welcome', now())
  on conflict (user_id) do update
    set state = '{}'::jsonb, stage = 'welcome', client_updated_at = now();
end;
$$;

revoke all on function public.admin_reset_journey(uuid) from public, anon;
grant execute on function public.admin_reset_journey(uuid) to authenticated;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
revoke all on function public.admin_set_suspended(uuid, boolean) from public, anon;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_suspended() to authenticated;

grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.journeys to authenticated;

commit;
