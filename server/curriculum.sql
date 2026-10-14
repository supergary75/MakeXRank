create table if not exists curriculum_months (
  level text not null check (level in ('U9','U12B','U12A','U15B','U15A','U18B','U18A')),
  month smallint not null check (month between 1 and 12),
  revision integer not null default 0,
  published jsonb not null,
  draft jsonb,
  state text not null default 'published' check (state in ('published','draft','submitted')),
  note text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (level,month)
);
create table if not exists curriculum_month_versions (
  level text not null,
  month smallint not null,
  revision integer not null,
  action text not null,
  published jsonb not null,
  draft jsonb,
  actor text not null,
  created_at timestamptz not null default now(),
  primary key (level,month,revision),
  foreign key (level,month) references curriculum_months(level,month)
);
