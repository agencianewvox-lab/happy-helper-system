-- Isolated preparation only. Does not change the live application's connection.
create schema if not exists migration_stage;
revoke all on schema migration_stage from public, anon, authenticated;
create table if not exists migration_stage.records (
  source_project text not null,
  source_table text not null,
  source_id text not null,
  row_data jsonb not null,
  row_hash text not null,
  copied_at timestamptz not null default now(),
  primary key (source_project, source_table, source_id),
  check (row_hash = encode(sha256(convert_to(row_data::text, 'UTF8')), 'hex'))
);
create table if not exists migration_stage.inventory (
  source_project text not null,
  source_table text not null,
  source_count bigint not null,
  copied_count bigint not null,
  verified_at timestamptz,
  notes text,
  primary key(source_project, source_table)
);
create table if not exists migration_stage.schema_objects (
  source_project text not null,
  object_kind text not null,
  object_name text not null,
  definition jsonb not null,
  captured_at timestamptz not null default now(),
  primary key(source_project, object_kind, object_name)
);
alter table migration_stage.records enable row level security;
alter table migration_stage.inventory enable row level security;
alter table migration_stage.schema_objects enable row level security;
revoke all on all tables in schema migration_stage from public, anon, authenticated;
comment on schema migration_stage is 'Private migration preparation, not an application schema. No production cutover authorized by this migration.';
