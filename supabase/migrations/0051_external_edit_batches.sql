-- =============================================================
-- 0051 — External edit batches (Fotello interim loop)
-- =============================================================
-- Interim workflow (docs/WORKFLOW_FOTELLO_EDIT_LOOP.md): photos are
-- exported as a sequence-named zip, edited at an external provider
-- (Fotello web app — no API below Partner plan), and the results are
-- imported back and attached to the same photos as processed outputs.
-- A BATCH tracks one round trip; an order can have several (revision
-- rounds each get their own timestamps, so turnaround is measurable).
-- =============================================================

create table if not exists external_edit_batches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null default 'fotello',
  -- export_ready → sent → returned → closed (all photos matched/imported)
  status text not null default 'export_ready',

  -- One entry per exported photo. export_name is the filename inside the
  -- zip and the ONLY key used to auto-match returned files, so it must
  -- stay unique within the batch. matched_photo_id is set on import
  -- (usually = photo_id; manual matching may point elsewhere).
  -- [{ photo_id, export_name, matched_photo_id?, imported_at? }]
  manifest jsonb not null default '[]'::jsonb,

  external_url text,             -- Fotello listing URL, pasted by producer
  photo_count int not null default 0,
  imported_count int not null default 0,
  notes text,

  sent_at timestamptz,
  returned_at timestamptz,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_edit_batches_order_idx on external_edit_batches(order_id);
create index if not exists external_edit_batches_status_idx on external_edit_batches(status);

alter table external_edit_batches enable row level security;

create policy "external_edit_batches team all" on external_edit_batches
  for all using (is_team_member()) with check (is_team_member());

-- updated_at maintenance (same trigger convention as core tables)
create trigger external_edit_batches_updated_at
  before update on external_edit_batches
  for each row execute function set_updated_at();
