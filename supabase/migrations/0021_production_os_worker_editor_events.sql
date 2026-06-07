-- =============================================================
-- Production OS — Migration 7: Local Worker + Outsourcing + Events
-- =============================================================
-- local_workers, worker_tasks, editor_assignments, production_events.
-- =============================================================

-- -----------------------------------------------------------------
-- LOCAL WORKERS
-- capabilities[]: photo_ingest | raw_conversion | bracket_detection
--   | thumbnail_generation | proxy_generation | transcription
--   | resolve_control | lightroom_control | file_upload | delivery_export
-- status: online | offline | busy | error
-- -----------------------------------------------------------------
create table if not exists local_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hostname text,
  capabilities text[] not null default '{}',
  status text not null default 'offline',
  last_heartbeat_at timestamptz,
  api_key_hash text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- WORKER TASKS  (queue for local workers)
-- task_type: scan_folder | generate_thumbnails | detect_brackets | convert_raw
--   | generate_proxy | transcribe_media | create_resolve_project
--   | import_resolve_media | create_resolve_timeline | render_export | upload_delivery
-- status: queued | running | completed | failed | cancelled
-- Phase 1 only exercises: scan_folder, generate_thumbnails.
-- -----------------------------------------------------------------
create table if not exists worker_tasks (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references local_workers(id) on delete set null,
  job_id uuid references jobs(id) on delete cascade,
  task_type text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}',
  result jsonb not null default '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- EDITOR ASSIGNMENTS  (internal + outsourced editing)
-- editor_type: internal | external | editors_connection | ai_assisted
-- status: draft | assigned | accepted | in_progress | submitted
--   | needs_revision | approved | closed | cancelled
-- -----------------------------------------------------------------
create table if not exists editor_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  editor_user_id uuid references auth.users(id) on delete set null,
  editor_type text not null default 'internal',
  editor_name text,
  status text not null default 'draft',
  brief text,
  edit_recipe_id uuid references edit_recipes(id) on delete set null,
  due_date date,
  assigned_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- PRODUCTION EVENTS  (universal activity log)
-- actor_type: user | agent | worker | make | integration | system | client | editor
-- The existing `activity_log` table is preserved; new events use this table.
-- -----------------------------------------------------------------
create table if not exists production_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  actor_type text not null default 'system',
  actor_id uuid,
  event_type text not null,
  summary text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
