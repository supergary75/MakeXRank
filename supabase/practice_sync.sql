create table if not exists public.practice_sync (
  id text primary key,
  events jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.practice_sync enable row level security;

drop policy if exists "practice sync authenticated read" on public.practice_sync;
create policy "practice sync authenticated read" on public.practice_sync for select to authenticated using (true);

drop policy if exists "practice sync authenticated insert" on public.practice_sync;
create policy "practice sync authenticated insert" on public.practice_sync for insert to authenticated with check (true);

drop policy if exists "practice sync authenticated update" on public.practice_sync;
create policy "practice sync authenticated update" on public.practice_sync for update to authenticated using (true) with check (true);

drop policy if exists "practice sync authenticated delete" on public.practice_sync;
create policy "practice sync authenticated delete" on public.practice_sync for delete to authenticated using (true);

comment on table public.practice_sync is 'Shared cloud storage for MakeXRank practice event cards.';
