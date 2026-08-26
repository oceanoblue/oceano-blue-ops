-- Quote builder: the office assembles a priced quote for a lead/property and
-- shares a public /quote/<token> link (read via the admin client in SSR).
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  client_name text,
  client_email text,
  address_line1 text not null,
  city text,
  state text,
  zip text,
  sqft integer,
  listing_date date,
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  status text not null default 'sent',
  notes text,
  expires_at timestamptz,
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotes_created_at_idx on public.quotes (created_at desc);

alter table public.quotes enable row level security;
create policy quotes_select_team on public.quotes for select to authenticated using (is_team_member());
create policy quotes_write_team on public.quotes for all to authenticated using (is_team_member()) with check (is_team_member());

-- Portfolio images shown on the quote page (team-managed ordered list). Seeded
-- with the on-brand Lowcountry product covers; swappable.
alter table public.business_settings
  add column if not exists portfolio_urls text[] not null default array[
    '/products/interior_exterior_photo.webp',
    '/products/twilight.webp',
    '/products/drone_photography.webp',
    '/products/reshoot.webp',
    '/products/virtual_tour.webp',
    '/products/amenities.webp'
  ]::text[];
