create table if not exists public.competitions (
  id text primary key,
  event_type text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_update text not null default '',
  source_text text not null default '',
  teams_data jsonb not null default '[]'::jsonb
);

alter table public.competitions enable row level security;

drop policy if exists "Public read competitions" on public.competitions;
create policy "Public read competitions"
on public.competitions
for select
to anon, authenticated
using (true);

drop policy if exists "Public insert competitions" on public.competitions;
create policy "Public insert competitions"
on public.competitions
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public update competitions" on public.competitions;
create policy "Public update competitions"
on public.competitions
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public delete competitions" on public.competitions;
create policy "Public delete competitions"
on public.competitions
for delete
to anon, authenticated
using (true);

comment on table public.competitions is
  'Shared competition records for the ranking board. Tighten these public policies before production if you need admin-only writes.';

create table if not exists public.user_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  is_active boolean not null default true,
  allowed_event_types text[] null,
  allowed_competition_ids text[] null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.user_profiles add column if not exists allowed_event_types text[] null;
alter table public.user_profiles add column if not exists allowed_competition_ids text[] null;

alter table public.user_profiles enable row level security;

create or replace function public.is_admin_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where auth_user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

grant execute on function public.is_admin_user() to anon, authenticated;

drop policy if exists "profiles bootstrap first admin" on public.user_profiles;
create policy "profiles bootstrap first admin"
on public.user_profiles
for insert
to anon
with check (
  role = 'admin'
  and is_active = true
  and not exists (select 1 from public.user_profiles)
);

drop policy if exists "profiles self read or admin read" on public.user_profiles;
create policy "profiles self read or admin read"
on public.user_profiles
for select
to authenticated
using (
  auth.uid() = auth_user_id
  or public.is_admin_user()
);

drop policy if exists "profiles admin insert" on public.user_profiles;
create policy "profiles admin insert"
on public.user_profiles
for insert
to authenticated
with check (public.is_admin_user());

drop policy if exists "profiles admin update" on public.user_profiles;
create policy "profiles admin update"
on public.user_profiles
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());
