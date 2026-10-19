-- Additive migration: existing account hashes, roles and scopes are unchanged.
create table if not exists auth_sessions (
  id uuid primary key,
  auth_user_id uuid not null references user_profiles(auth_user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  revoked_at timestamptz
);
create index if not exists auth_sessions_user_idx on auth_sessions(auth_user_id);
alter table refresh_tokens add column if not exists session_id uuid references auth_sessions(id) on delete cascade;
create table if not exists auth_attempts (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create index if not exists auth_attempts_expiry_idx on auth_attempts(expires_at);
