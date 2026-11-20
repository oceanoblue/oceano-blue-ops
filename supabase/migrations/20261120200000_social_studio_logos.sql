-- Social Studio: a logo for each client and each sub-account. Additive only.
--
-- The image itself lives in the public-assets bucket under social-logos/.
-- The server uploads it and saves the link here; the browser never writes
-- these columns or the bucket directly.

alter table public.social_programs
  add column logo_url text not null default '' check (length(logo_url) <= 500);

alter table public.social_accounts
  add column logo_url text not null default '' check (length(logo_url) <= 500);
