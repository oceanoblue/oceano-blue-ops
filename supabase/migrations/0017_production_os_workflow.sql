-- =============================================================
-- Production OS — Migration 3: Workflow Engine
-- =============================================================
-- workflow_templates → workflow_runs → workflow_steps, plus tool_runs,
-- the universal observability log for every tool / AI / automation /
-- integration / worker / external action.
-- =============================================================

-- -----------------------------------------------------------------
-- WORKFLOW TEMPLATES
-- Reusable workflow definitions. `definition` mirrors the workflow-as-code
-- JSON files under /workflows.
-- -----------------------------------------------------------------
create table if not exists workflow_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null,
  job_type_id uuid references job_types(id) on delete set null,
  description text,
  definition jsonb not null default '{}',
  is_active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- WORKFLOW RUNS
-- A template running on a specific job.
-- status: not_started | running | waiting | needs_review | failed
--   | completed | cancelled | paused
-- -----------------------------------------------------------------
create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  workflow_template_id uuid references workflow_templates(id) on delete set null,
  name text,
  status text not null default 'not_started',
  current_step int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- WORKFLOW STEPS
-- step_type: manual | ai_task | worker_task | make_scenario | mcp_tool
--   | review | qc | delivery | external_editor
-- status: not_started | running | waiting | needs_review | failed
--   | completed | cancelled | skipped
-- -----------------------------------------------------------------
create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  step_index int not null default 0,
  name text not null,
  step_type text not null default 'manual',
  status text not null default 'not_started',
  assignee_id uuid references auth.users(id) on delete set null,
  config jsonb not null default '{}',
  result jsonb not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- TOOL RUNS
-- The most important observability table. Every tool/AI/automation/
-- integration/worker/external action gets a row. Make.com scenario runs
-- are tracked here too.
-- tool_type: ai_model | mcp_tool | local_worker | resolve_script
--   | lightroom_export | imagen_job | evoto_job | fotello_job
--   | higgsfield_generation | make_scenario | notion_sync | dropbox_upload
--   | google_drive_upload | frame_io_review | vimeo_upload
--   | pixieset_delivery | email_send | manual_action
-- status: queued | waiting_for_approval | running | completed | failed
--   | cancelled | skipped
-- -----------------------------------------------------------------
create table if not exists tool_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  workflow_step_id uuid references workflow_steps(id) on delete set null,
  tool_type text not null default 'manual_action',
  provider text,
  status text not null default 'queued',
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error text,
  cost_cents int not null default 0,
  duration_ms int,
  external_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
