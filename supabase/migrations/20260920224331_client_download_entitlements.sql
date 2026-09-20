-- Client ownership alone does not grant download access to a priced order.
-- Keep staff policies intact. Free orders and recorded payments remain accessible.
alter policy "client read own delivered photos" on public.photos
  to authenticated
  using (kind in ('processed','delivered') and is_selected = true and exists (
    select 1 from public.orders o where o.id = photos.order_id
      and o.client_id in (select public.current_client_ids())
      and (coalesce(o.total_cents,0) <= 0 or o.download_paid_at is not null)
  ));

alter policy "client read own delivery files" on storage.objects
  to authenticated
  using (bucket_id in ('delivery','processed-photos') and exists (
    select 1 from public.photos p join public.orders o on o.id=p.order_id
    where p.storage_path=objects.name and p.bucket=objects.bucket_id
      and p.kind in ('processed','delivered') and p.is_selected=true
      and o.client_id in (select public.current_client_ids())
      and (coalesce(o.total_cents,0) <= 0 or o.download_paid_at is not null)
  ));

-- Non-photo links contain original file locations: withhold the row until paid.
-- Unassigned or mismatched deliverables fail closed; staff can correct provenance.
alter policy "client read own published deliverables" on public.listing_deliverables
  to authenticated
  using (is_published=true and exists (
    select 1 from public.orders o join public.listings l on l.id=o.listing_id
    where o.id=listing_deliverables.order_id and o.listing_id=listing_deliverables.listing_id
      and o.client_id in (select public.current_client_ids())
      and l.client_id in (select public.current_client_ids())
      and (coalesce(o.total_cents,0) <= 0 or o.download_paid_at is not null)
  ));

alter policy "client read own renders" on storage.objects
  to authenticated
  using (bucket_id='reel-renders' and exists (
    select 1 from public.orders o
    where o.id::text=split_part(objects.name,'/',1)
      and o.client_id in (select public.current_client_ids())
      and o.status='delivered'
      and (coalesce(o.total_cents,0) <= 0 or o.download_paid_at is not null)
  ));
