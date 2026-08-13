-- Normalized collaboration storage. Existing JSON sync tables remain available
-- during the transition and can be used as a rollback/read fallback.

create table if not exists public.collaboration_events (
  id text primary key,
  event_type text not null check (event_type in ('logistics', 'practice', 'training')),
  name text not null default '',
  event_date text not null default '',
  venue text not null default '',
  event_group text not null default '',
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.event_nodes (
  id text primary key,
  event_id text not null references public.collaboration_events(id) on delete cascade,
  event_item text not null default '',
  node_date text not null default '',
  node_time text not null default '',
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.room_assignments (
  id text primary key,
  event_id text not null references public.collaboration_events(id) on delete cascade,
  room_no text not null default '',
  stay_dates text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.event_schedules (
  id text primary key,
  event_id text not null references public.collaboration_events(id) on delete cascade,
  event_item text not null default '',
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.match_scores (
  id text primary key,
  schedule_id text not null references public.event_schedules(id) on delete cascade,
  match_id text not null,
  red_score integer,
  blue_score integer,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (schedule_id, match_id)
);

create index if not exists event_nodes_event_id_idx on public.event_nodes(event_id) where deleted_at is null;
create index if not exists room_assignments_event_id_idx on public.room_assignments(event_id) where deleted_at is null;
create index if not exists event_schedules_event_id_idx on public.event_schedules(event_id) where deleted_at is null;
create index if not exists match_scores_schedule_id_idx on public.match_scores(schedule_id) where deleted_at is null;

alter table public.collaboration_events enable row level security;
alter table public.event_nodes enable row level security;
alter table public.room_assignments enable row level security;
alter table public.event_schedules enable row level security;
alter table public.match_scores enable row level security;

do $policies$
declare table_name text;
begin
  foreach table_name in array array['collaboration_events','event_nodes','room_assignments','event_schedules','match_scores'] loop
    execute format('drop policy if exists %I on public.%I', table_name || ' authenticated read', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || ' authenticated read', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' authenticated insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) is not null)', table_name || ' authenticated insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' authenticated update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check ((select auth.uid()) is not null)', table_name || ' authenticated update', table_name);
  end loop;
end $policies$;

grant select, insert, update on public.collaboration_events, public.event_nodes,
  public.room_assignments, public.event_schedules, public.match_scores to authenticated;

-- Compare-and-swap helpers increment version atomically and reject stale edits.
create or replace function public.update_collaboration_event(
  target_id text,
  expected_version bigint,
  next_payload jsonb
) returns public.collaboration_events
language plpgsql security invoker set search_path = public
as $$
declare result public.collaboration_events;
begin
  update public.collaboration_events
  set payload = next_payload,
      name = coalesce(next_payload->>'name', name),
      event_date = coalesce(next_payload->>'date', event_date),
      venue = coalesce(next_payload->>'venue', venue),
      event_group = coalesce(next_payload->>'group', event_group),
      version = version + 1,
      updated_at = now(), updated_by = auth.uid()
  where id = target_id and version = expected_version and deleted_at is null
  returning * into result;
  if result.id is null then raise exception 'VERSION_CONFLICT' using errcode = '40001'; end if;
  return result;
end;
$$;

grant execute on function public.update_collaboration_event(text,bigint,jsonb) to authenticated;

-- One RPC call is one Postgres transaction. It mirrors the legacy logistics
-- snapshot row-by-row, increments versions, and soft-deletes missing children.
create or replace function public.mirror_logistics_snapshot(
  event_rows jsonb,
  deleted_event_ids jsonb default '[]'::jsonb
) returns void
language plpgsql security invoker set search_path = public
as $$
declare event_row jsonb; node_row jsonb; room_row jsonb; current_event_id text;
begin
  if jsonb_typeof(event_rows) <> 'array' or jsonb_typeof(deleted_event_ids) <> 'array' then
    raise exception 'INVALID_SNAPSHOT';
  end if;

  for event_row in select value from jsonb_array_elements(event_rows) loop
    current_event_id := event_row->>'id';
    if nullif(current_event_id, '') is null then raise exception 'EVENT_ID_REQUIRED'; end if;

    insert into public.collaboration_events
      (id,event_type,name,event_date,venue,event_group,payload,version,deleted_at,updated_at,updated_by)
    values
      (current_event_id,'logistics',coalesce(event_row->>'name',''),coalesce(event_row->>'date',''),
       coalesce(event_row->>'venue',''),coalesce(event_row->>'group',''),event_row,1,null,now(),auth.uid())
    on conflict (id) do update set
      name=excluded.name,event_date=excluded.event_date,venue=excluded.venue,event_group=excluded.event_group,
      payload=excluded.payload,version=collaboration_events.version+1,deleted_at=null,updated_at=now(),updated_by=auth.uid();

    for node_row in select value from jsonb_array_elements(coalesce(event_row->'timeline','[]'::jsonb)) loop
      insert into public.event_nodes
        (id,event_id,event_item,node_date,node_time,title,payload,version,deleted_at,updated_at,updated_by)
      values
        (node_row->>'id',current_event_id,coalesce(node_row->>'eventItem',''),coalesce(node_row->>'date',''),
         coalesce(node_row->>'time',''),coalesce(node_row->>'title',''),node_row,1,null,now(),auth.uid())
      on conflict (id) do update set
        event_id=excluded.event_id,event_item=excluded.event_item,node_date=excluded.node_date,
        node_time=excluded.node_time,title=excluded.title,payload=excluded.payload,
        version=event_nodes.version+1,deleted_at=null,updated_at=now(),updated_by=auth.uid();
    end loop;
    update public.event_nodes set deleted_at=now(),version=version+1,updated_at=now(),updated_by=auth.uid()
    where event_id=current_event_id and deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(event_row->'timeline','[]'::jsonb)) value where value->>'id'=event_nodes.id);

    for room_row in select value from jsonb_array_elements(coalesce(event_row->'rooms','[]'::jsonb)) loop
      insert into public.room_assignments
        (id,event_id,room_no,stay_dates,payload,version,deleted_at,updated_at,updated_by)
      values
        (room_row->>'id',current_event_id,coalesce(room_row->>'roomNo',''),
         array(select jsonb_array_elements_text(coalesce(room_row->'dates','[]'::jsonb))),room_row,1,null,now(),auth.uid())
      on conflict (id) do update set
        event_id=excluded.event_id,room_no=excluded.room_no,stay_dates=excluded.stay_dates,payload=excluded.payload,
        version=room_assignments.version+1,deleted_at=null,updated_at=now(),updated_by=auth.uid();
    end loop;
    update public.room_assignments set deleted_at=now(),version=version+1,updated_at=now(),updated_by=auth.uid()
    where event_id=current_event_id and deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(event_row->'rooms','[]'::jsonb)) value where value->>'id'=room_assignments.id);
  end loop;

  update public.collaboration_events set deleted_at=now(),version=version+1,updated_at=now(),updated_by=auth.uid()
  where event_type='logistics' and deleted_at is null
    and id in (select jsonb_array_elements_text(deleted_event_ids));
end;
$$;

grant execute on function public.mirror_logistics_snapshot(jsonb,jsonb) to authenticated;

do $realtime$
declare table_name text;
begin
  foreach table_name in array array['collaboration_events','event_nodes','room_assignments','event_schedules','match_scores'] loop
    if not exists (
      select 1 from pg_publication_tables publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $realtime$;

alter table public.collaboration_events replica identity full;
alter table public.event_nodes replica identity full;
alter table public.room_assignments replica identity full;
alter table public.event_schedules replica identity full;
alter table public.match_scores replica identity full;
