-- Social Studio (/dashboard/social): running social media programs for clients.
-- A program is one client engagement (for example a hotel group). It holds
-- accounts (one per property or brand), each with a monthly quota. Content
-- items are the individual posts, reels and Google posts, moved through a
-- production pipeline. Media batches and media requests track what the client
-- has sent us and what we still need.
--
-- Like social onboarding, the browser never writes these tables directly: the
-- server validates every change and writes with the service role. Office users
-- read through RLS; nobody else can read or write.

create table public.social_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  contact_name text not null default '' check (length(contact_name) <= 160),
  contact_email text not null default '' check (length(contact_email) <= 254),
  -- Where posts are published from (for example Statusbrew). Free text.
  publishing_tool text not null default '' check (length(publishing_tool) <= 80),
  status text not null default 'onboarding'
    check (status in ('prospect', 'onboarding', 'active', 'paused', 'ended')),
  notes text not null default '' check (length(notes) <= 4000),
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.social_programs(id),
  name text not null check (length(name) between 1 and 160),
  tier text not null default 'standard'
    check (tier in ('standard', 'high_volume', 'corporate')),
  platforms text[] not null default '{}'
    check (platforms <@ array['facebook', 'instagram', 'linkedin', 'google', 'x', 'youtube', 'tiktok']::text[]),
  posts_per_month integer not null default 0 check (posts_per_month between 0 and 60),
  reels_per_month integer not null default 0 check (reels_per_month between 0 and 20),
  google_posts_per_month integer not null default 0 check (google_posts_per_month between 0 and 20),
  -- Link to each social profile, keyed by platform: {"facebook": "https://..."}.
  profile_links jsonb not null default '{}'::jsonb check (jsonb_typeof(profile_links) = 'object'),
  -- The account's Canva brand kit (or brand folder).
  brand_kit_url text not null default '' check (length(brand_kit_url) <= 500),
  media_folder_url text not null default '' check (length(media_folder_url) <= 500),
  voice_notes text not null default '' check (length(voice_notes) <= 4000),
  access_status text not null default 'pending'
    check (access_status in ('pending', 'connected', 'issue')),
  access_note text not null default '' check (length(access_note) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, name)
);
create index social_accounts_program_idx on public.social_accounts (program_id, name);

create table public.social_content_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id),
  -- First day of the month this piece belongs to.
  month date not null check (extract(day from month) = 1),
  kind text not null check (kind in ('post', 'reel', 'google_post')),
  -- Position within the account's quota for the month. Together with the
  -- unique key below this makes "plan the month" safe to run twice.
  slot integer not null check (slot between 1 and 60),
  pillar text not null
    check (pillar in ('property_feature', 'local_event', 'local_story', 'flexible', 'video', 'google_update')),
  title text not null default '' check (length(title) <= 200),
  caption text not null default '' check (length(caption) <= 5000),
  status text not null default 'planned'
    check (status in ('planned', 'needs_media', 'in_design', 'internal_review',
                      'client_review', 'approved', 'scheduled', 'published')),
  scheduled_for date,
  assignee uuid references public.team_members(id),
  -- The Canva design (or other design file) for this piece.
  design_url text not null default '' check (length(design_url) <= 500),
  published_url text not null default '' check (length(published_url) <= 500),
  review_note text not null default '' check (length(review_note) <= 2000),
  updated_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, month, kind, slot)
);
create index social_content_items_month_idx on public.social_content_items (month, account_id);
create index social_content_items_assignee_idx on public.social_content_items (assignee, month)
  where assignee is not null;

-- What the client (or we) added to an account's media library, and when.
-- The files themselves stay in the client's Canva, Dropbox or Drive folder;
-- this is the count we plan against.
create table public.social_media_batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id),
  received_on date not null,
  source text not null check (source in ('client_visit', 'property', 'oceano_shoot', 'stock')),
  photos integer not null default 0 check (photos between 0 and 2000),
  videos integer not null default 0 check (videos between 0 and 500),
  link text not null default '' check (length(link) <= 500),
  note text not null default '' check (length(note) <= 500),
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  check (photos + videos > 0)
);
create index social_media_batches_account_idx on public.social_media_batches (account_id, received_on desc);

-- Media we have asked the client for.
create table public.social_media_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id),
  ask text not null check (length(ask) between 1 and 500),
  due_on date,
  status text not null default 'open' check (status in ('open', 'sent', 'received', 'cancelled')),
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_media_requests_account_idx on public.social_media_requests (account_id, status);

do $$ declare tbl text; begin
  foreach tbl in array array['social_programs', 'social_accounts', 'social_content_items',
                             'social_media_batches', 'social_media_requests'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from public, anon, authenticated', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
    execute format('grant select, insert, update on public.%I to service_role', tbl);
    execute format('create policy office_read on public.%I for select to authenticated using (exists (select 1 from public.team_members t where t.id = (select auth.uid()) and t.is_active and t.role::text in (''admin'', ''coordinator'')))', tbl);
  end loop;
end $$;
