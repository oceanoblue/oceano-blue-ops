-- =============================================================
-- Production OS — thumbnails bucket (Photo Rescue v2)
-- =============================================================
-- Lightweight preview thumbnails for the visual bracket review + contact
-- sheet. Full-resolution originals (RAW/JPEG) stay LOCAL by design — only
-- small JPEG previews live here. Private bucket; team-only; served via signed
-- URLs (mirrors the raw-photos pattern).
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('thumbnails', 'thumbnails', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Team-only read/write (is_team_member() defined in 0002_rls_policies.sql).
drop policy if exists "team read thumbnails" on storage.objects;
create policy "team read thumbnails"
  on storage.objects for select
  using (bucket_id = 'thumbnails' and is_team_member());

drop policy if exists "team write thumbnails" on storage.objects;
create policy "team write thumbnails"
  on storage.objects for insert
  with check (bucket_id = 'thumbnails' and is_team_member());

drop policy if exists "team update thumbnails" on storage.objects;
create policy "team update thumbnails"
  on storage.objects for update
  using (bucket_id = 'thumbnails' and is_team_member());

drop policy if exists "team delete thumbnails" on storage.objects;
create policy "team delete thumbnails"
  on storage.objects for delete
  using (bucket_id = 'thumbnails' and is_team_member());
