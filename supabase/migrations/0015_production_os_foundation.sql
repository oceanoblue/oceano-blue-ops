-- =============================================================
-- Production OS — Migration 1: Foundation
-- =============================================================
-- Introduces the universal production model that sits ALONGSIDE the
-- existing real estate tables (clients, listings, orders, photos, ...).
-- Nothing here deletes or rewrites existing tables.
--
--   clients (existing)
--     → client_profiles (Client DNA)
--     → projects
--       → jobs
--
-- Design note: status / type columns use plain `text` with sensible
-- defaults rather than Postgres enums. These lifecycle vocabularies are
-- expected to evolve quickly during Phase 1+, and text avoids an
-- ALTER TYPE migration every time a status is added. Allowed values are
-- documented inline. Lookup-style values (job types) live in their own
-- seeded table.
-- =============================================================

-- -----------------------------------------------------------------
-- USER PROFILES
-- Extends the new role model on top of Supabase auth. Coexists with the
-- existing `team_members` table; `team_member_id` bridges the two.
-- role: owner | admin | producer | editor | photo_editor | video_editor
--       | external_editor | client | viewer
-- -----------------------------------------------------------------
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext,
  full_name text,
  role text not null default 'viewer',
  team_member_id uuid references team_members(id) on delete set null,
  avatar_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- CLIENT PROFILES  (Client DNA / Client Brain)
-- Captures how each client likes their content produced.
-- -----------------------------------------------------------------
create table if not exists client_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  display_name text,
  tone text,
  visual_style text,
  editing_preferences jsonb not null default '{}',
  music_preferences text,
  caption_style text,
  color_preferences text,
  pacing_preferences text,
  logo_rules text,
  approval_preferences text,
  do_not_do_notes text,
  compliance_notes text,
  approved_examples jsonb not null default '[]',
  rejected_examples jsonb not null default '[]',
  recurring_deliverables jsonb not null default '[]',
  default_language text not null default 'en',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_profiles_client_idx on client_profiles(client_id);

-- -----------------------------------------------------------------
-- PROJECTS
-- Broad container for a client initiative. A project has many jobs.
-- status: active | on_hold | completed | archived | cancelled
-- -----------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'active',
  language text not null default 'en',
  start_date date,
  due_date date,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- PROJECT MEMBERS
-- Per-project access list (used by RLS in later phases).
-- -----------------------------------------------------------------
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- -----------------------------------------------------------------
-- JOB TYPES  (seeded lookup)
-- category: photography | video | podcast | automation | design | delivery
-- -----------------------------------------------------------------
create table if not exists job_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- JOBS
-- The main production unit. Lives under a project.
-- status: intake | scheduled | media_received | ingesting | in_progress
--   | waiting_on_ai | waiting_on_editor | waiting_on_client | needs_review
--   | needs_revision | ready_to_deliver | delivered | approved | archived
--   | cancelled | failed
-- -----------------------------------------------------------------
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number serial unique,
  project_id uuid references projects(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  job_type_id uuid references job_types(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'intake',
  priority text not null default 'normal',          -- low | normal | high | rush
  language text not null default 'en',
  scheduled_at timestamptz,
  due_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  next_action text,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
