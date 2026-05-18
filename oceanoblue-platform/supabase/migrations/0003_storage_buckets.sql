-- =============================================================
-- Storage buckets
-- =============================================================
-- raw-photos      : original uploads from photographers (private)
-- processed-photos: AI-enhanced or editor-finished (private)
-- delivery        : MLS-sized + watermarked deliverables (private, accessed via signed URL)
-- public-assets   : brand assets, public (logo, sample images)
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('raw-photos',       'raw-photos',       false, 268435456, array['image/jpeg','image/png','image/tiff','image/x-adobe-dng','image/x-canon-cr2','image/x-canon-cr3','image/x-nikon-nef','image/x-sony-arw']),
  ('processed-photos', 'processed-photos', false, 134217728, array['image/jpeg','image/png','image/webp','image/tiff']),
  ('delivery',         'delivery',         false, 134217728, array['image/jpeg','image/png','image/webp']),
  ('public-assets',    'public-assets',    true,  10485760,  array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- Storage policies: only authenticated team members can read/write
-- the private buckets. Public-assets is open.
create policy "team read raw-photos"
  on storage.objects for select
  using (bucket_id = 'raw-photos' and is_team_member());

create policy "team write raw-photos"
  on storage.objects for insert
  with check (bucket_id = 'raw-photos' and is_team_member());

create policy "team update raw-photos"
  on storage.objects for update
  using (bucket_id = 'raw-photos' and is_team_member());

create policy "team delete raw-photos"
  on storage.objects for delete
  using (bucket_id = 'raw-photos' and is_team_member());

create policy "team rw processed-photos"
  on storage.objects for all
  using (bucket_id = 'processed-photos' and is_team_member())
  with check (bucket_id = 'processed-photos' and is_team_member());

create policy "team rw delivery"
  on storage.objects for all
  using (bucket_id = 'delivery' and is_team_member())
  with check (bucket_id = 'delivery' and is_team_member());

create policy "public read assets"
  on storage.objects for select
  using (bucket_id = 'public-assets');

create policy "team write assets"
  on storage.objects for insert
  with check (bucket_id = 'public-assets' and is_team_member());
