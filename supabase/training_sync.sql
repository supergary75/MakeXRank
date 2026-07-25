create table if not exists public.training_sync (
  id text primary key,
  events jsonb not null default '[]'::jsonb,
  schedules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.training_sync enable row level security;

drop policy if exists "training sync authenticated read" on public.training_sync;
create policy "training sync authenticated read"
on public.training_sync
for select
to authenticated
using (true);

drop policy if exists "training sync authenticated insert" on public.training_sync;
create policy "training sync authenticated insert"
on public.training_sync
for insert
to authenticated
with check (true);

drop policy if exists "training sync authenticated update" on public.training_sync;
create policy "training sync authenticated update"
on public.training_sync
for update
to authenticated
using (true)
with check (true);

drop policy if exists "training sync authenticated delete" on public.training_sync;
create policy "training sync authenticated delete"
on public.training_sync
for delete
to authenticated
using (true);

comment on table public.training_sync is
  'Shared cloud storage for MakeXRank training calendar events and schedules.';
