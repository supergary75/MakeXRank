create table if not exists public.team_tag_sync (
  id text primary key,
  tags jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.team_tag_sync enable row level security;

drop policy if exists "team tag sync authenticated read" on public.team_tag_sync;
create policy "team tag sync authenticated read"
on public.team_tag_sync
for select
to authenticated
using (true);

drop policy if exists "team tag sync public read" on public.team_tag_sync;
create policy "team tag sync public read"
on public.team_tag_sync
for select
to anon, authenticated
using (true);

drop policy if exists "team tag sync authenticated insert" on public.team_tag_sync;
create policy "team tag sync authenticated insert"
on public.team_tag_sync
for insert
to authenticated
with check (true);

drop policy if exists "team tag sync public insert" on public.team_tag_sync;
create policy "team tag sync public insert"
on public.team_tag_sync
for insert
to anon, authenticated
with check (true);

drop policy if exists "team tag sync authenticated update" on public.team_tag_sync;
create policy "team tag sync authenticated update"
on public.team_tag_sync
for update
to authenticated
using (true)
with check (true);

drop policy if exists "team tag sync public update" on public.team_tag_sync;
create policy "team tag sync public update"
on public.team_tag_sync
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "team tag sync authenticated delete" on public.team_tag_sync;
create policy "team tag sync authenticated delete"
on public.team_tag_sync
for delete
to authenticated
using (true);

comment on table public.team_tag_sync is
  'Shared cloud storage for MakeXRank team tags and tag options.';
