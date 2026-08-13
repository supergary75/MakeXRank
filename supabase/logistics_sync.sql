create table if not exists public.logistics_sync (
  id text primary key,
  events jsonb not null default '[]'::jsonb,
  deleted_event_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.logistics_sync
add column if not exists deleted_event_ids jsonb not null default '[]'::jsonb;

alter table public.logistics_sync enable row level security;

drop policy if exists "logistics sync authenticated read" on public.logistics_sync;
create policy "logistics sync authenticated read"
on public.logistics_sync
for select
to authenticated
using (true);

drop policy if exists "logistics sync authenticated insert" on public.logistics_sync;
create policy "logistics sync authenticated insert"
on public.logistics_sync
for insert
to authenticated
with check (true);

drop policy if exists "logistics sync authenticated update" on public.logistics_sync;
create policy "logistics sync authenticated update"
on public.logistics_sync
for update
to authenticated
using (true)
with check (true);

drop policy if exists "logistics sync authenticated delete" on public.logistics_sync;
create policy "logistics sync authenticated delete"
on public.logistics_sync
for delete
to authenticated
using (true);

comment on table public.logistics_sync is
  'Shared cloud storage for MakeXRank logistics events, rosters, rooms, timelines, and attendance.';

comment on column public.logistics_sync.deleted_event_ids is
  'Shared tombstones that prevent deleted logistics event cards from being restored by another client.';
