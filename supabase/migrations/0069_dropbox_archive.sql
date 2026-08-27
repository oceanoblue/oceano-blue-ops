-- Automated Dropbox archival: once an order has been delivered for a grace
-- window, its per-order intake folder is moved to a "/Photo Intake/_Archive"
-- tree. This column marks that it's been archived so the cron doesn't retry.
alter table public.orders add column if not exists dropbox_archived_at timestamptz;
