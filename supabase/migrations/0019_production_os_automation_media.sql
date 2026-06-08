-- =============================================================
-- Production OS — Migration 5: Automation Runtime + Podcast + Video
-- =============================================================
-- automation_scenarios (Make.com), the podcast engine, and the video
-- editing bridge (transcripts, edit_recipes, resolve_projects).
--
-- Make.com is wrapped, not replaced: it becomes the Automation Runtime
-- Layer and its runs are tracked as `tool_runs`.
-- =============================================================

-- -----------------------------------------------------------------
-- AUTOMATION SCENARIOS
-- provider: make | (future)
-- -----------------------------------------------------------------
create table if not exists automation_scenarios (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'make',
  name text not null,
  external_id text,                 -- e.g. Make scenario id
  description text,
  trigger text,
  status text not null default 'active',
  config jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- PODCAST SHOWS
-- -----------------------------------------------------------------
create table if not exists podcast_shows (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  name text not null,
  hosts text,
  description text,
  default_language text not null default 'en',
  visual_style text,
  audio_style text,
  intro_rules text,
  outro_rules text,
  publishing_platforms jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- PODCAST EPISODES
-- status: intake | scheduled | recorded | ingested | transcribed | editing
--   | clips_in_progress | needs_review | ready_to_publish | published
--   | archived | cancelled
-- -----------------------------------------------------------------
create table if not exists podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references podcast_shows(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  episode_number int,
  title text,
  status text not null default 'intake',
  recorded_at timestamptz,
  language text not null default 'en',
  notes text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- PODCAST DELIVERABLES
-- deliverable_type: full_episode_video | full_episode_audio | vertical_clip
--   | square_clip | thumbnail | show_notes | transcript | caption_file
--   | social_caption | blog_post | newsletter_blurb | published_link
-- -----------------------------------------------------------------
create table if not exists podcast_deliverables (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references podcast_episodes(id) on delete cascade,
  deliverable_type text not null,
  status text not null default 'draft',
  asset_id uuid references assets(id) on delete set null,
  external_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- TRANSCRIPTS
-- For videos, podcasts, interviews, voiceovers, testimonials.
-- -----------------------------------------------------------------
create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  episode_id uuid references podcast_episodes(id) on delete set null,
  language text not null default 'en',
  provider text,
  confidence numeric,
  text text,
  segments jsonb not null default '[]',
  speakers jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- EDIT RECIPES
-- Structured edit plan: the bridge between AI, outsourced editors, and
-- DaVinci Resolve. AI produces a recipe; humans approve; editors/Resolve
-- execute from it.
-- status: draft | needs_review | approved | sent_to_editor | sent_to_resolve
--   | superseded | archived
-- -----------------------------------------------------------------
create table if not exists edit_recipes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  title text,
  status text not null default 'draft',
  story_structure jsonb not null default '{}',
  timeline_instructions jsonb not null default '[]',
  caption_instructions text,
  music_direction text,
  color_direction text,
  audio_direction text,
  graphics_direction text,
  delivery_requirements text,
  human_notes text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- RESOLVE PROJECTS
-- DaVinci Resolve project/timeline tracking. (No automation in Phase 1.)
-- status: planned | created | media_imported | timeline_created | editing
--   | rendering | rendered | failed | archived
-- -----------------------------------------------------------------
create table if not exists resolve_projects (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  edit_recipe_id uuid references edit_recipes(id) on delete set null,
  name text,
  status text not null default 'planned',
  resolve_project_id text,
  timeline_name text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
