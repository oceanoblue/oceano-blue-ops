-- =============================================================
-- Production OS — Migration 6: Review + QC + Delivery
-- =============================================================
-- review_sessions, review_comments, qc_reports, quality_score_events,
-- delivery_versions.
-- =============================================================

-- -----------------------------------------------------------------
-- REVIEW SESSIONS
-- provider: frame_io | vimeo | dropbox_replay | pixieset | internal | timeliner
-- status: open | waiting_on_client | changes_requested | approved | closed | cancelled
-- -----------------------------------------------------------------
create table if not exists review_sessions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  provider text,
  status text not null default 'open',
  title text,
  external_url text,
  external_id text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- REVIEW COMMENTS
-- author_type: client | team | editor
-- status: open | in_progress | resolved | ignored | client_clarification_needed
-- -----------------------------------------------------------------
create table if not exists review_comments (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null references review_sessions(id) on delete cascade,
  author_name text,
  author_type text,
  body text,
  timecode text,
  status text not null default 'open',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- QC REPORTS
-- qc_type: real_estate_photo_qc | portrait_qc | commercial_photo_qc
--   | video_story_qc | video_audio_qc | video_color_qc | caption_qc
--   | brand_qc | delivery_qc | podcast_qc | automation_qc
-- status: pending | passed | failed | needs_review | needs_revision | waived
-- `checks` holds per-item results (e.g. neutral whites, vertical lines, ...).
-- -----------------------------------------------------------------
create table if not exists qc_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  qc_type text not null,
  status text not null default 'pending',
  quality_score numeric,
  checks jsonb not null default '[]',
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- QUALITY SCORE EVENTS  (Oceano Quality Score history)
-- score_type: photo_quality | video_quality | audio_quality | brand_fit
--   | delivery_readiness | client_approval_risk | automation_reliability
-- -----------------------------------------------------------------
create table if not exists quality_score_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  qc_report_id uuid references qc_reports(id) on delete set null,
  score_type text not null,
  score_delta numeric,
  score_value numeric,
  reason text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- DELIVERY VERSIONS
-- delivery_type: photo_gallery | download_zip | video_draft | video_final
--   | podcast_episode | podcast_clip | caption_file | thumbnail | show_notes
--   | social_caption_package | archive_package
-- status: draft | internal_review | client_review | changes_requested
--   | approved | delivered | published | archived | failed
-- -----------------------------------------------------------------
create table if not exists delivery_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  version_number int not null default 1,
  delivery_type text not null default 'photo_gallery',
  status text not null default 'draft',
  title text,
  external_url text,
  storage_location_id uuid references storage_locations(id) on delete set null,
  notes text,
  delivered_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
