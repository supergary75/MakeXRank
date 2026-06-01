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
