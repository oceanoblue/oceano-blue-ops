-- 0045_photo_qc_reports.sql
-- Batch QC / consistency reports for an order's finished photo set.
--
-- The "Consistency check" reviews every delivered photo for color accuracy,
-- white-balance consistency across the set, and material/wall-color drift vs the
-- original. Each run is stored here so the result persists across reloads and we
-- keep a history of checks.
--
-- Additive + idempotent.

begin;

create table if not exists photo_qc_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null default 'complete',
  -- { photo_count, consistency_score, median, warm, cool, wall_drift, wb_issues, … }
  summary jsonb not null default '{}'::jsonb,
  -- [{ photo_id, filename, flags, deltaB, ai:{ wall_drift, … } }, …]
  findings jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_photo_qc_reports_order
  on photo_qc_reports(order_id, created_at desc);

alter table photo_qc_reports enable row level security;

do $$ begin
  create policy "team read qc reports" on photo_qc_reports
    for select using (is_team_member());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "team write qc reports" on photo_qc_reports
    for all using (is_team_member()) with check (is_team_member());
exception when duplicate_object then null; end $$;

commit;
