create table if not exists academic_rosters (
  class_id text primary key,
  revision integer not null check (revision > 0),
  members jsonb not null check (jsonb_typeof(members) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by text not null
);
create table if not exists academic_attendance (
  class_id text not null,
  lesson_date date not null,
  session text not null check (session in ('regular','extra1','extra2')),
  revision integer not null check (revision > 0),
  record jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  primary key (class_id, lesson_date, session)
);
create index if not exists academic_attendance_date_idx on academic_attendance (lesson_date, class_id);
create table if not exists academic_holidays (
  lesson_date date primary key,
  revision integer not null check (revision > 0),
  active boolean not null,
  note text not null,
  actor text not null,
  updated_at timestamptz not null default now()
);
-- Append-only history; removing a student from a roster never deletes attendance.
create table if not exists academic_changes (
  id bigint generated always as identity primary key,
  kind text not null,
  document_key text not null,
  revision integer not null,
  snapshot jsonb not null,
  actor text not null,
  created_at timestamptz not null default now()
);
create index if not exists academic_changes_document_idx on academic_changes (kind, document_key, revision desc);
