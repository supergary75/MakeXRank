create table if not exists user_profiles (
  auth_user_id uuid primary key,
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  is_active boolean not null default true,
  allowed_event_types text[],
  allowed_competition_ids text[],
  created_at timestamptz not null default now()
);

-- Canonical account identity: the login username and displayed name are both
-- `supergary`; authorization continues to use the immutable auth_user_id.
update user_profiles set display_name='supergary'
where lower(username)='supergary' and display_name<>'supergary';

create table if not exists refresh_tokens (
  token_hash text primary key,
  auth_user_id uuid not null references user_profiles(auth_user_id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists refresh_tokens_expiry_idx on refresh_tokens(expires_at);

create table if not exists competitions (
  id text primary key, event_type text not null, name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_update text not null default '', source_text text not null default '',
  teams_data jsonb not null default '[]'::jsonb
);
create index if not exists competitions_created_at_idx on competitions(created_at desc);

-- Keep a tombstone for deleted cards. Older browsers may still have a cached
-- copy and try to upload it again; the API uses this table to prevent that
-- stale copy from resurrecting a deleted competition.
create table if not exists competition_deletions (
  id text primary key,
  deleted_at timestamptz not null default now()
);

create table if not exists practice_sync (
  id text primary key, events jsonb not null default '[]',
  deleted_event_ids jsonb not null default '[]', updated_at timestamptz not null default now()
);
create table if not exists training_sync (
  id text primary key, events jsonb not null default '[]', schedules jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table if not exists team_tag_sync (
  id text primary key, tags jsonb not null default '{}', options jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create table if not exists logistics_sync (
  id text primary key, events jsonb not null default '[]', deleted_event_ids jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create table if not exists inspire_sync (
  id text primary key, payload jsonb not null default '{}', updated_at timestamptz not null default now()
);

create table if not exists collaboration_events (
  id text primary key, event_type text not null, name text not null default '', event_date text not null default '',
  venue text not null default '', event_group text not null default '', payload jsonb not null default '{}',
  version bigint not null default 1, deleted_at timestamptz, updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists event_nodes (
  id text primary key, event_id text not null references collaboration_events(id) on delete cascade,
  event_item text not null default '', node_date text not null default '', node_time text not null default '',
  title text not null default '', payload jsonb not null default '{}', version bigint not null default 1,
  deleted_at timestamptz, updated_at timestamptz not null default now(), updated_by uuid
);
create index if not exists event_nodes_event_id_idx on event_nodes(event_id) where deleted_at is null;
create table if not exists room_assignments (
  id text primary key, event_id text not null references collaboration_events(id) on delete cascade,
  room_no text not null default '', stay_dates text[] not null default '{}', payload jsonb not null default '{}',
  version bigint not null default 1, deleted_at timestamptz, updated_at timestamptz not null default now(), updated_by uuid
);
create index if not exists room_assignments_event_id_idx on room_assignments(event_id) where deleted_at is null;
create table if not exists event_schedules (
  id text primary key, event_id text not null references collaboration_events(id) on delete cascade,
  event_item text not null default '', payload jsonb not null default '{}', version bigint not null default 1,
  deleted_at timestamptz, updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists match_scores (
  id text primary key, schedule_id text not null references event_schedules(id) on delete cascade,
  match_id text not null, red_score integer, blue_score integer, payload jsonb not null default '{}',
  version bigint not null default 1, deleted_at timestamptz, updated_at timestamptz not null default now(),
  updated_by uuid, unique(schedule_id,match_id)
);
