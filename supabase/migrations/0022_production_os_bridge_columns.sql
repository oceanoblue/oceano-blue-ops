-- =============================================================
-- Production OS — Migration 8: Bridge Columns (optional, nullable)
-- =============================================================
-- Connect existing real estate tables to the new universal model WITHOUT
-- breaking or backfilling them. All columns are nullable. No data is
-- migrated here — backfill happens later, once the new shell is stable.
--
--   orders.job_id                    → jobs
--   photos.asset_id                  → assets
--   ai_jobs.tool_run_id              → tool_runs
--   delivery_links.delivery_version_id → delivery_versions
--   listings.project_id              → projects
--   listings.job_id                  → jobs
-- =============================================================

alter table orders
  add column if not exists job_id uuid references jobs(id) on delete set null;

alter table photos
  add column if not exists asset_id uuid references assets(id) on delete set null;

alter table ai_jobs
  add column if not exists tool_run_id uuid references tool_runs(id) on delete set null;

alter table delivery_links
  add column if not exists delivery_version_id uuid references delivery_versions(id) on delete set null;

alter table listings
  add column if not exists project_id uuid references projects(id) on delete set null;

alter table listings
  add column if not exists job_id uuid references jobs(id) on delete set null;

create index if not exists orders_job_idx on orders(job_id);
create index if not exists photos_asset_idx on photos(asset_id);
create index if not exists ai_jobs_tool_run_idx on ai_jobs(tool_run_id);
create index if not exists delivery_links_delivery_version_idx on delivery_links(delivery_version_id);
create index if not exists listings_project_idx on listings(project_id);
create index if not exists listings_job_idx on listings(job_id);
