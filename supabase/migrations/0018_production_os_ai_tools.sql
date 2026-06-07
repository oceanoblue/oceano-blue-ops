-- =============================================================
-- Production OS — Migration 4: AI Control Plane + Tool Registry
-- =============================================================
-- ai_models, agents, prompt_templates, ai_tasks, tools, integrations,
-- external_links, approval_policies, approvals.
--
-- Guardrail principle: AI may analyze / draft / recommend / prepare, but
-- high-risk actions (publish, send to client, delete, overwrite, trigger
-- paid tools, archive finals) require human approval.
-- =============================================================

-- -----------------------------------------------------------------
-- AI MODELS
-- roles[]: creative_strategy | script_generation | code_generation
--   | photo_qc | video_edit_recipe | transcript_analysis
--   | caption_generation | client_communication | workflow_planning
-- -----------------------------------------------------------------
create table if not exists ai_models (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  provider text not null,
  name text not null,
  roles text[] not null default '{}',
  is_active boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- AGENTS
-- -----------------------------------------------------------------
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null,
  description text,
  default_model_id uuid references ai_models(id) on delete set null,
  system_prompt text,
  config jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- PROMPT TEMPLATES
-- -----------------------------------------------------------------
create table if not exists prompt_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null,
  agent_id uuid references agents(id) on delete set null,
  template text not null,
  variables jsonb not null default '[]',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- AI TASKS
-- task_type: generate_project_brief | generate_editor_instructions
--   | generate_photo_qc_notes | generate_video_edit_recipe
--   | generate_podcast_show_notes | generate_clip_ideas
--   | generate_social_captions | generate_client_delivery_message
--   | review_client_brand_fit
-- status: queued | running | needs_review | completed | failed | cancelled
-- -----------------------------------------------------------------
create table if not exists ai_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  model_id uuid references ai_models(id) on delete set null,
  tool_run_id uuid references tool_runs(id) on delete set null,
  task_type text not null,
  status text not null default 'queued',
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  requires_approval boolean not null default false,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- TOOLS  (registry of approved system tools)
-- risk_level: low | medium | high | critical
-- -----------------------------------------------------------------
create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null,
  tool_type text,
  risk_level text not null default 'low',
  requires_approval boolean not null default false,
  description text,
  config jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- INTEGRATIONS
-- status: not_connected | connected | error | disabled
-- NOTE: real secrets belong in env / a secret store, not in `credentials`.
-- -----------------------------------------------------------------
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  name text not null,
  status text not null default 'not_connected',
  config jsonb not null default '{}',
  credentials jsonb not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- EXTERNAL LINKS
-- Connect internal records to outside tools.
-- link_type: monday_board | monday_item | frame_io_project | frame_io_asset
--   | google_drive_folder | dropbox_folder | vimeo_review_link
--   | pixieset_gallery | make_scenario_run | notion_page
--   | timeliner_project | higgsfield_generation
-- -----------------------------------------------------------------
create table if not exists external_links (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  link_type text not null,
  url text,
  external_id text,
  label text,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- APPROVAL POLICIES
-- action: publish | send_to_client | delete | overwrite | trigger_paid_tool
--   | send_invoice | archive_final
-- -----------------------------------------------------------------
create table if not exists approval_policies (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null,
  action text not null,
  required_role text not null default 'producer',
  is_active boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- APPROVALS
-- status: pending | approved | rejected | cancelled
-- -----------------------------------------------------------------
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  policy_id uuid references approval_policies(id) on delete set null,
  tool_run_id uuid references tool_runs(id) on delete set null,
  ai_task_id uuid references ai_tasks(id) on delete set null,
  status text not null default 'pending',
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
