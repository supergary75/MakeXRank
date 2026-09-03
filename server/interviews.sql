-- Independent interview permissions: no automatic grants based on display names.
create table if not exists interview_staff (
  user_id uuid primary key references user_profiles(auth_user_id),
  role text not null check (role in ('manager','coach')),
  label text not null unique check (label in ('Lisa','Gary','Brook','Jason','Vincent')),
  active boolean not null default true,
  check ((role='manager' and label='Lisa') or (role='coach' and label<>'Lisa'))
);
create table if not exists interviews (
  id uuid primary key,
  manager_id uuid not null references interview_staff(user_id),
  coach_id uuid not null references interview_staff(user_id),
  version integer not null,
  payload jsonb not null,
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists interviews_manager_idx on interviews(manager_id);
create index if not exists interviews_coach_idx on interviews(coach_id);
create table if not exists interview_notifications (
  id text primary key,
  interview_id uuid not null references interviews(id),
  recipient_id uuid not null references interview_staff(user_id),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists interview_notifications_recipient_idx on interview_notifications(recipient_id, created_at desc);
create table if not exists interview_reminders (
  id text primary key,
  interview_id uuid not null references interviews(id),
  recipient_id uuid not null references interview_staff(user_id),
  schedule_version integer not null,
  minutes integer not null,
  due_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','sent','cancelled'))
);
create index if not exists interview_reminders_due_idx on interview_reminders(due_at) where state='pending';
create table if not exists interview_templates (
  id text primary key check (id in ('u9','u12','u15','u18')),
  version integer not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references interview_staff(user_id)
);
create table if not exists interview_template_versions (
  template_id text not null references interview_templates(id),
  version integer not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references interview_staff(user_id),
  primary key(template_id,version)
);
