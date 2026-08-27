-- Cloud photo pipeline P2: a photos row can point at a RAW that lives in Dropbox
-- (the per-order intake folder) instead of Supabase Storage. The AI runner
-- resolves a temporary link and downloads the bytes at processing time, so RAWs
-- never transit Supabase Storage — Dropbox stays the durable archive.
alter table public.photos add column if not exists dropbox_path text;
