-- Independent identity snapshots survive account/session deletion. No credentials or IPs.
alter table auth_sessions add column if not exists revoked_reason text;
create table if not exists auth_access_history (
  id bigserial primary key,
  session_id uuid not null unique,
  auth_user_id uuid not null,
  username text not null,
  display_name text not null,
  logged_in_at timestamptz not null,
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  password_setup boolean not null,
  legacy boolean not null default false
);
create index if not exists auth_access_history_date_idx on auth_access_history(logged_in_at desc,id desc);
create index if not exists auth_access_history_username_idx on auth_access_history(username,id desc);
create index if not exists auth_access_history_expiry_idx on auth_access_history(expires_at) where ended_at is null;
create table if not exists auth_access_events (
  id bigserial primary key,
  history_id bigint not null references auth_access_history(id),
  phase text not null check(phase in ('started','ended')),
  event_type text not null,
  occurred_at timestamptz not null,
  notified_at timestamptz,
  unique(history_id,phase)
);
create index if not exists auth_access_events_unread_idx on auth_access_events(id desc) where notified_at is null;
create table if not exists auth_access_tracking (
  singleton boolean primary key default true check(singleton),
  started_at timestamptz not null default now()
);
insert into auth_access_tracking(singleton) values(true) on conflict do nothing;

-- Existing session timestamps are retained, explicitly marked historical, never announced as new logins.
insert into auth_access_history(session_id,auth_user_id,username,display_name,logged_in_at,expires_at,ended_at,end_reason,password_setup,legacy)
select s.id,s.auth_user_id,p.username,p.display_name,s.created_at,s.expires_at,
  case when s.revoked_at is not null then least(s.revoked_at,s.expires_at) when s.expires_at<=now() then s.expires_at end,
  case when s.revoked_at is not null then 'legacy_revoked' when s.expires_at<=now() then 'expired' end,
  s.password_setup,true
from auth_sessions s join user_profiles p on p.auth_user_id=s.auth_user_id
order by s.created_at,s.id on conflict(session_id) do nothing;

create or replace function makexrank_access_event() returns trigger language plpgsql as $$
begin
  if TG_OP='INSERT' then
    if not NEW.legacy then
      insert into auth_access_events(history_id,phase,event_type,occurred_at)
      values(NEW.id,'started',case when NEW.password_setup then 'initial_verification' else 'login' end,NEW.logged_in_at)
      on conflict(history_id,phase) do nothing;
    end if;
  elsif OLD.ended_at is null and NEW.ended_at is not null then
    insert into auth_access_events(history_id,phase,event_type,occurred_at)
    values(NEW.id,'ended',NEW.end_reason,NEW.ended_at) on conflict(history_id,phase) do nothing;
  end if;
  return NEW;
end $$;
drop trigger if exists makexrank_access_event_trigger on auth_access_history;
create trigger makexrank_access_event_trigger after insert or update on auth_access_history
for each row execute function makexrank_access_event();

create or replace function makexrank_access_session() returns trigger language plpgsql as $$
begin
  if TG_OP='INSERT' then
    insert into auth_access_history(session_id,auth_user_id,username,display_name,logged_in_at,expires_at,password_setup)
    select NEW.id,NEW.auth_user_id,p.username,p.display_name,NEW.created_at,NEW.expires_at,NEW.password_setup
    from user_profiles p where p.auth_user_id=NEW.auth_user_id;
  elsif TG_OP='UPDATE' then
    update auth_access_history set expires_at=NEW.expires_at,
      ended_at=case when NEW.revoked_at is not null then least(NEW.revoked_at,NEW.expires_at) else null end,
      end_reason=case when NEW.revoked_at is not null then
        case when NEW.expires_at<=NEW.revoked_at then 'expired' else coalesce(NEW.revoked_reason,'revoked') end end
    where session_id=NEW.id and ended_at is null;
  else
    update auth_access_history set ended_at=least(coalesce(OLD.revoked_at,now()),OLD.expires_at),
      end_reason=case when OLD.expires_at<=coalesce(OLD.revoked_at,now()) then 'expired' else coalesce(OLD.revoked_reason,'revoked') end
    where session_id=OLD.id and ended_at is null;
  end if;
  return null;
end $$;
drop trigger if exists makexrank_access_session_trigger on auth_sessions;
create trigger makexrank_access_session_trigger after insert or update or delete on auth_sessions
for each row execute function makexrank_access_session();
