-- Only complete ZIPs and their verification manifests live here.
-- No anon/authenticated Storage policy is added. Token, expiry and payment are
-- checked by the server before issuing a one-hour signed attachment URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-downloads', 'gallery-downloads', false, 5368709120,
        array['application/zip', 'application/json'])
on conflict (id) do nothing;
