-- Run explicitly after deployment, inside one transaction; never at API startup.
-- The initial Amber hash is supplied privately through a PostgreSQL session setting.
create table if not exists staff_login_onboarding (
  target_username text primary key,
  auth_user_id uuid not null unique references user_profiles(auth_user_id) on delete cascade,
  previous_username text,
  applied_at timestamptz not null default now()
);
set local lock_timeout='5s';
set local statement_timeout='15s';
select pg_advisory_xact_lock(hashtext('makexrank:staff-login-onboarding-20261020'));
do $$
declare
  item record;
  original user_profiles%rowtype;
  existing_id uuid;
  recorded_id uuid;
  amber_hash text;
begin
  if not exists(select 1 from user_profiles where username='supergary' and role='admin' and is_active) then
    raise exception 'Active owner account is required; no accounts changed';
  end if;
  for item in select * from (values
    ('vincentc','kclub-vincent','Vincent'),
    ('brooky','kclub-brook','Brook'),
    ('jasonz','kclub-jason','Jason'),
    ('lisaw','kclub-lisa','Lisa')
  ) as t(old_name,new_name,display_name) loop
    select auth_user_id into recorded_id from staff_login_onboarding where target_username=item.new_name;
    if found then
      if not exists(select 1 from user_profiles where auth_user_id=recorded_id and username=item.new_name) then
        raise exception 'Previously migrated identity changed: %',item.new_name;
      end if;
      continue; -- Never reset an already claimed personal password on a retry.
    end if;
    select * into original from user_profiles where username=item.old_name for update;
    if not found then raise exception 'Source account missing: %',item.old_name; end if;
    if exists(select 1 from user_profiles where username=item.new_name) then
      raise exception 'Target login already exists; manual identity review required: %',item.new_name;
    end if;
    update user_profiles set username=item.new_name,display_name=item.display_name,must_change_password=true
      where auth_user_id=original.auth_user_id;
    update auth_sessions set revoked_at=now() where auth_user_id=original.auth_user_id;
    delete from refresh_tokens where auth_user_id=original.auth_user_id;
    insert into staff_login_onboarding(target_username,auth_user_id,previous_username)
      values(item.new_name,original.auth_user_id,item.old_name);
  end loop;

  select auth_user_id into recorded_id from staff_login_onboarding where target_username='kclub-amber';
  if found then
    if not exists(select 1 from user_profiles where auth_user_id=recorded_id and username='kclub-amber') then
      raise exception 'Previously migrated Amber identity changed';
    end if;
  else
    select auth_user_id into existing_id from user_profiles where username='kclub-amber';
    if found then raise exception 'Amber login already exists; manual identity review required'; end if;
    amber_hash=current_setting('makexrank.amber_hash',true);
    if amber_hash is null or amber_hash !~ '^[0-9a-f]{32}:[0-9a-f]{128}$' then
      raise exception 'A private salted initial password hash is required for Amber';
    end if;
    insert into user_profiles(auth_user_id,username,display_name,password_hash,role,must_change_password)
      values(gen_random_uuid(),'kclub-amber','Amber',amber_hash,'editor',true) returning auth_user_id into existing_id;
    insert into staff_login_onboarding(target_username,auth_user_id,previous_username) values('kclub-amber',existing_id,null);
  end if;
end $$;
