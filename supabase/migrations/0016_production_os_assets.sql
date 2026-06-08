-- =============================================================
-- Production OS — Migration 2: Asset Intelligence Layer
-- =============================================================
-- Universal media/file records plus grouping (brackets, drone sets,
-- multicam, delivery sets) and storage-location tracking. Heavy media
-- stays on local/NAS/Dropbox/Drive/Frame.io; these tables store records,
-- paths, links, metadata, thumbnails, and proxies.
-- =============================================================

-- -----------------------------------------------------------------
-- STORAGE LOCATIONS
-- kind: local | nas | external_drive | dropbox | google_drive
--     | supabase | frame_io | vimeo | pixieset | other
-- -----------------------------------------------------------------
create table if not exists storage_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other',
  root_path text,
  url text,
  details jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- ASSETS
-- asset_type: source | proxy | thumbnail | preview | transcript | script
--   | logo | graphic | project_file | edit_export | delivery_file
--   | caption_file | show_notes | archive_package
-- media_type: photo | video | audio | document | graphic | folder
--   | project_file | other
-- status: discovered | indexed | grouped | needs_review | processing
--   | processed | rejected | approved | delivered | archived | missing | failed
-- -----------------------------------------------------------------
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  storage_location_id uuid references storage_locations(id) on delete set null,
  asset_type text not null default 'source',
  media_type text not null default 'other',
  status text not null default 'discovered',
  filename text,
  local_path text,
  storage_path text,
  external_url text,
  thumbnail_url text,
  mime_type text,
  width int,
  height int,
  duration_seconds numeric,
  byte_size bigint,
  checksum text,
  captured_at timestamptz,
  exif jsonb,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- ASSET VERSIONS
-- Lineage of edits/exports for a single asset.
-- -----------------------------------------------------------------
create table if not exists asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  version_number int not null default 1,
  label text,
  storage_path text,
  external_url text,
  byte_size bigint,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- ASSET GROUPS
-- group_type: real_estate_bracket | panorama | drone_set | portrait_selects
--   | interview_take | broll_scene | audio_sync_group | multicam_group
--   | podcast_episode_media | delivery_set
-- confidence_score / review_required power the real estate bracket rescue.
-- -----------------------------------------------------------------
create table if not exists asset_groups (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  group_type text not null default 'delivery_set',
  name text,
  confidence_score numeric,            -- 0..1
  review_required boolean not null default false,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- ASSET GROUP ITEMS
-- role: base_exposure | flash | ambient | drone | reject | manual_review | other
-- -----------------------------------------------------------------
create table if not exists asset_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references asset_groups(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  role text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, asset_id)
);
