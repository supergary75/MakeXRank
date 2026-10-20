-- Additive migration: existing account hashes, roles and scopes are unchanged.
alter table user_profiles add column if not exists must_change_password boolean not null default false;
create table if not exists auth_sessions (
  id uuid primary key,
  auth_user_id uuid not null references user_profiles(auth_user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  revoked_at timestamptz
);
create index if not exists auth_sessions_user_idx on auth_sessions(auth_user_id);
alter table auth_sessions add column if not exists password_setup boolean not null default false;
alter table refresh_tokens add column if not exists session_id uuid references auth_sessions(id) on delete cascade;
-- Fixed seven days from sign-in, never extended by refresh or app reopening.
alter table auth_sessions alter column expires_at set default (now()+interval '7 days');
update auth_sessions set expires_at=created_at+interval '7 days'
where expires_at>created_at+interval '7 days';
update refresh_tokens r set expires_at=s.expires_at from auth_sessions s
where r.session_id=s.id and r.expires_at>s.expires_at;
create table if not exists auth_attempts (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create index if not exists auth_attempts_expiry_idx on auth_attempts(expires_at);
