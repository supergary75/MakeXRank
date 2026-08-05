create table if not exists public.inspire_sync (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_inspire_sync_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_inspire_sync_updated_at on public.inspire_sync;
create trigger set_inspire_sync_updated_at
before update on public.inspire_sync
for each row execute function public.set_inspire_sync_updated_at();

alter table public.inspire_sync enable row level security;

drop policy if exists "inspire sync authenticated read" on public.inspire_sync;
create policy "inspire sync authenticated read"
on public.inspire_sync for select to authenticated using (true);

drop policy if exists "inspire sync authenticated insert" on public.inspire_sync;
create policy "inspire sync authenticated insert"
on public.inspire_sync for insert to authenticated with check (true);

drop policy if exists "inspire sync authenticated update" on public.inspire_sync;
create policy "inspire sync authenticated update"
on public.inspire_sync for update to authenticated using (true) with check (true);

drop policy if exists "inspire sync authenticated delete" on public.inspire_sync;
create policy "inspire sync authenticated delete"
on public.inspire_sync for delete to authenticated using (true);

grant select, insert, update, delete on public.inspire_sync to authenticated;

comment on table public.inspire_sync is
'Shared cloud storage for the MakeXRank Inspire training module.';
