alter table public.logistics_sync
add column if not exists deleted_event_ids jsonb not null default '[]'::jsonb;

comment on column public.logistics_sync.deleted_event_ids is
'Shared tombstones that prevent deleted logistics event cards from being restored by another client.';
