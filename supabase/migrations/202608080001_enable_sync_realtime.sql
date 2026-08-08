-- Keep all shared MakeXRank state tables available to Supabase Realtime.
-- The frontend also uses a short version-aware polling fallback so updates
-- continue to arrive when a browser or network blocks WebSocket traffic.
do $$
declare
  sync_table_name text;
begin
  foreach sync_table_name in array array[
    'competitions',
    'training_sync',
    'team_tag_sync',
    'logistics_sync',
    'practice_sync'
  ]
  loop
    if to_regclass(format('public.%I', sync_table_name)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = sync_table_name
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', sync_table_name);
    end if;
  end loop;
end
$$;

grant select, insert, update, delete on table
  public.training_sync,
  public.logistics_sync,
  public.practice_sync
to authenticated;
