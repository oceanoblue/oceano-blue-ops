-- =============================================================
-- 0047 — Edit-job queue for the office-Mac Resolve engine
-- =============================================================
-- Phase 2: reel + long-form video orders are fulfilled by a daemon running
-- DaVinci Resolve on an office Mac. The daemon authenticates with the existing
-- per-worker Bearer key (local_workers + authenticateWorker) and a new
-- 'edit_video' capability, and works a DEDICATED edit_jobs queue (kept separate
-- from the photo-pipeline worker_tasks, which are bound to production-OS jobs).
--
-- Podcasts are unchanged — they keep running on the Make.com pipeline.
-- =============================================================

-- 1. Long-form video order kind (reel_edit already exists from 0046) ---------
alter type order_kind add value if not exists 'long_form_edit';

-- 2. Edit-job queue ----------------------------------------------------------
create table if not exists edit_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null default 'queued',  -- queued | running | done | failed | canceled
  worker_id uuid references local_workers(id) on delete set null,
  edit_plan jsonb not null default '{}'::jsonb,  -- snapshot of reel_briefs.edit_instructions at enqueue
  attempts int not null default 0,
  result_bucket text,
  result_path text,
  result_filename text,
  result_byte_size bigint,
  result_duration_seconds numeric,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists edit_jobs_order_idx on edit_jobs(order_id);
create index if not exists edit_jobs_status_idx on edit_jobs(status);

alter table edit_jobs enable row level security;

-- Team: full access. Clients: read-only on their own orders' jobs (so the
-- portal can show "in production"). All mutations happen server-side via the
-- worker endpoints (admin client) — no client write policy.
create policy "team all edit_jobs" on edit_jobs
  for all using (is_team_member()) with check (is_team_member());
create policy "client read own edit_jobs" on edit_jobs
  for select using (
    exists (select 1 from orders o where o.id = edit_jobs.order_id and o.client_id = current_client_id())
  );

-- 3. Rendered-output bucket --------------------------------------------------
-- Private. Path = <order_id>/<edit_job_id>/<filename>. The worker uploads via a
-- server-issued signed upload URL (bypasses RLS), so no worker write policy is
-- needed. Team reads everything; a client reads renders for their own orders.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reel-renders', 'reel-renders', false, 5368709120,
  array['video/mp4','video/quicktime','video/webm']
)
on conflict (id) do nothing;

create policy "team all renders" on storage.objects for all
  using (bucket_id = 'reel-renders' and is_team_member())
  with check (bucket_id = 'reel-renders' and is_team_member());

create policy "client read own renders" on storage.objects for select
  using (
    bucket_id = 'reel-renders'
    and exists (
      select 1 from orders o
      where o.id::text = split_part(name, '/', 1)
        and o.client_id = current_client_id()
    )
  );
