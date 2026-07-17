-- =============================================================
-- 0055 — Listing deliverables (unified client Media Room)
-- =============================================================
-- The client portal shows only photos today. This adds the other finished
-- media a real-estate shoot produces — VIDEO, 360/virtual TOUR, FLOOR PLAN —
-- as first-class deliverables attached to a LISTING, so a property's whole
-- media set lives on one portal page.
--
-- Each deliverable is EITHER an external link (Matterport / YouTube / Vimeo —
-- source='url') OR an uploaded file (an MP4, a floor-plan PDF/image —
-- source='file' in the new `deliverables` bucket). One flexible shape covers
-- every case without forcing the studio to self-host video.
--
-- Security mirrors the client portal (0005): team full access; a client reads
-- only PUBLISHED deliverables for their own listings, via current_client_id().
-- Uploaded-file URLs are signed server-side (admin) after that ownership check.
-- =============================================================

create table if not exists listing_deliverables (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,   -- provenance
  -- video | tour_360 | floor_plan | other
  kind text not null,
  title text,
  -- 'url' (external_url set) | 'file' (bucket+storage_path set)
  source text not null,
  external_url text,
  bucket text,
  storage_path text,
  filename text,
  mime_type text,
  byte_size bigint,
  thumbnail_url text,
  -- The office controls when a client can see it.
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_deliverables_listing_idx on listing_deliverables(listing_id);
create index if not exists listing_deliverables_order_idx on listing_deliverables(order_id);
create trigger listing_deliverables_updated_at before update on listing_deliverables
  for each row execute procedure set_updated_at();

alter table listing_deliverables enable row level security;

-- Team: full access (add / publish / delete).
create policy "team all listing_deliverables" on listing_deliverables
  for all using (is_team_member()) with check (is_team_member());

-- Client: read only PUBLISHED deliverables for listings they own.
create policy "client read own published deliverables" on listing_deliverables
  for select using (
    is_published = true
    and exists (
      select 1 from listings l
      where l.id = listing_deliverables.listing_id
        and l.client_id = current_client_id()
    )
  );

-- -----------------------------------------------------------------
-- Storage: one private bucket for delivered media (video + PDF +
-- images). 5 GB cap to fit walkthrough videos. Team manages it;
-- client-facing file URLs are admin-signed after the ownership check
-- above, so no per-client storage policy is required here.
-- -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deliverables', 'deliverables', false, 5368709120,
  array[
    'video/mp4','video/quicktime','video/webm',
    'application/pdf',
    'image/jpeg','image/png','image/webp'
  ]
)
on conflict (id) do nothing;

create policy "team all deliverables bucket"
  on storage.objects for all
  using (bucket_id = 'deliverables' and is_team_member())
  with check (bucket_id = 'deliverables' and is_team_member());
