-- =============================================================
-- Oceano Blue Platform — Initial Schema
-- =============================================================
-- Models the real estate photo production pipeline:
-- clients (agents) → listings → orders (shoots) → photos → delivery
-- =============================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------
-- TEAM
-- Internal staff (coordinators, photographers, editors, admins).
-- Each row maps 1:1 to a Supabase auth.users row.
-- -----------------------------------------------------------------
create type team_role as enum ('admin', 'coordinator', 'photographer', 'editor');

create table team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null,
  role team_role not null default 'coordinator',
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- CLIENTS (real estate agents)
-- -----------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  full_name text not null,
  brokerage text,
  phone text,
  billing_address text,
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_email_idx on clients(email);

-- -----------------------------------------------------------------
-- LISTINGS (properties to be photographed)
-- -----------------------------------------------------------------
create type listing_status as enum (
  'draft', 'active', 'shot', 'in_production', 'delivered', 'archived'
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  mls_id text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  zip text not null,
  lat double precision,
  lng double precision,
  property_type text,            -- single_family, condo, townhouse, etc
  bedrooms int,
  bathrooms numeric(3,1),
  sqft int,
  list_price numeric(12,2),
  access_notes text,             -- gate code, lockbox, contact
  status listing_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_client_idx on listings(client_id);
create index listings_status_idx on listings(status);

-- -----------------------------------------------------------------
-- ORDERS (a scheduled shoot for a listing)
-- -----------------------------------------------------------------
create type order_status as enum (
  'draft',          -- created from booking form, awaiting team review
  'booked',         -- accepted by team, not yet scheduled
  'scheduled',      -- date & photographer assigned
  'shooting',       -- in progress on site
  'uploaded',       -- raw photos uploaded, awaiting processing
  'processing',     -- AI / editor in progress
  'editing',        -- in editor queue
  'ready',          -- ready to deliver, awaiting review
  'delivered',      -- delivered to client
  'cancelled'
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number serial unique,
  listing_id uuid not null references listings(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  status order_status not null default 'draft',

  scheduled_at timestamptz,
  duration_minutes int default 60,
  photographer_id uuid references team_members(id),
  editor_id uuid references team_members(id),
  coordinator_id uuid references team_members(id),

  package_name text,             -- e.g. "Essential", "Premium", "Drone+"
  subtotal_cents int default 0,
  total_cents int default 0,

  client_notes text,             -- from booking form
  internal_notes text,           -- staff-only
  rush boolean not null default false,

  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_listing_idx on orders(listing_id);
create index orders_client_idx on orders(client_id);
create index orders_status_idx on orders(status);
create index orders_scheduled_idx on orders(scheduled_at);
create index orders_photographer_idx on orders(photographer_id);

-- -----------------------------------------------------------------
-- SERVICES (line items on an order)
-- -----------------------------------------------------------------
create type service_type as enum (
  'photos_hdr', 'photos_standard', 'twilight', 'drone_photos', 'drone_video',
  'video_walkthrough', 'virtual_tour', 'floor_plan', 'matterport', 'rush_delivery', 'other'
);

create table order_services (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  service_type service_type not null,
  description text,
  quantity int not null default 1,
  unit_price_cents int not null default 0,
  total_cents int not null default 0,
  created_at timestamptz not null default now()
);

create index order_services_order_idx on order_services(order_id);

-- -----------------------------------------------------------------
-- PHOTOS
-- One row per delivered or raw image. HDR brackets are grouped via
-- bracket_group_id so the AI processor can merge them.
-- -----------------------------------------------------------------
create type photo_kind as enum ('raw', 'bracket_member', 'processed', 'delivered');
create type processing_status as enum (
  'pending', 'queued', 'running', 'complete', 'failed', 'skipped'
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  kind photo_kind not null default 'raw',
  bracket_group_id uuid,         -- groups bracketed shots (HDR)
  parent_photo_id uuid references photos(id), -- processed → raw lineage

  storage_path text not null,    -- path in storage bucket
  bucket text not null default 'raw-photos',
  filename text not null,
  mime_type text,
  width int,
  height int,
  byte_size bigint,
  exif jsonb,                    -- shutter, ISO, aperture, exposure_bias, timestamp, lens

  is_hdr boolean not null default false,
  is_selected boolean not null default true, -- editor can deselect

  processing_status processing_status not null default 'pending',
  ai_provider text,              -- 'openai-gpt-image' | 'gemini-banana-pro' | null
  ai_prompt text,
  ai_cost_cents int default 0,

  sort_order int default 0,
  uploaded_by uuid references team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index photos_order_idx on photos(order_id);
create index photos_bracket_idx on photos(bracket_group_id);
create index photos_kind_idx on photos(kind);
create index photos_status_idx on photos(processing_status);

-- -----------------------------------------------------------------
-- AI JOBS
-- One row per AI processing run. A single HDR merge job can output
-- multiple photos; tracked via output_photo_ids.
-- -----------------------------------------------------------------
create type ai_job_type as enum (
  'hdr_merge', 'enhance_single', 'sky_replace', 'window_pull',
  'lawn_enhance', 'declutter', 'twilight_convert', 'virtual_stage'
);

create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  job_type ai_job_type not null,
  provider text not null,                 -- 'openai-gpt-image' | 'gemini-banana-pro'
  model text,                             -- e.g. 'gpt-image-1', 'imagen-3-banana-pro'

  input_photo_ids uuid[] not null,
  output_photo_ids uuid[] default '{}',
  prompt text,
  params jsonb,

  status processing_status not null default 'pending',
  error_message text,
  cost_cents int default 0,
  duration_ms int,

  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now()
);

create index ai_jobs_order_idx on ai_jobs(order_id);
create index ai_jobs_status_idx on ai_jobs(status);

-- -----------------------------------------------------------------
-- DELIVERY LINKS (token-based gallery access for clients)
-- -----------------------------------------------------------------
create table delivery_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  token text not null unique,             -- url-safe random token
  password_hash text,                     -- optional bcrypt hash
  expires_at timestamptz,
  download_count int not null default 0,
  view_count int not null default 0,
  last_viewed_at timestamptz,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now()
);

create index delivery_links_token_idx on delivery_links(token);
create index delivery_links_order_idx on delivery_links(order_id);

-- -----------------------------------------------------------------
-- SCHEDULE BLOCKS
-- Photographer time-off, holds, route gaps.
-- -----------------------------------------------------------------
create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  is_available boolean not null default false, -- false = blocked, true = explicit availability
  created_at timestamptz not null default now()
);

create index schedule_blocks_member_idx on schedule_blocks(team_member_id);
create index schedule_blocks_starts_idx on schedule_blocks(starts_at);

-- -----------------------------------------------------------------
-- ACTIVITY LOG
-- -----------------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  actor_id uuid,                          -- team member or null for system
  actor_type text,                        -- 'team' | 'client' | 'system'
  action text not null,                   -- 'status_changed', 'photo_uploaded', etc
  details jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_order_idx on activity_log(order_id);
create index activity_log_created_idx on activity_log(created_at desc);

-- -----------------------------------------------------------------
-- UPDATED_AT trigger
-- -----------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger team_members_updated_at before update on team_members
  for each row execute procedure set_updated_at();
create trigger clients_updated_at before update on clients
  for each row execute procedure set_updated_at();
create trigger listings_updated_at before update on listings
  for each row execute procedure set_updated_at();
create trigger orders_updated_at before update on orders
  for each row execute procedure set_updated_at();
create trigger photos_updated_at before update on photos
  for each row execute procedure set_updated_at();
