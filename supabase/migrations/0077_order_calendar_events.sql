-- =============================================================
-- 0077 — Per-calendar event tracking for shoot sync
-- =============================================================
-- A shoot now appears on MULTIPLE Google calendars: the master (info@) shows
-- every shoot, and the assigned shooter's own calendar shows it as busy. We must
-- track which Google event lives on which calendar per order so we can move,
-- retitle, or delete them when the shoot is reassigned / rescheduled / cancelled.
-- (The single orders.gcal_event_id can't represent multiple calendars.)
-- =============================================================

create table if not exists order_calendar_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  calendar_id text not null,   -- Google calendar id (the account email: info@…, gustavo@…, karen@…)
  event_id    text not null,   -- Google event id on that calendar
  role        text not null,   -- 'master' | 'assignee'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (order_id, calendar_id)
);

create index if not exists order_calendar_events_order_idx on order_calendar_events(order_id);

alter table order_calendar_events enable row level security;
-- Written only by the server (admin client); no direct client access needed.
create policy "team read order_calendar_events" on order_calendar_events
  for select using (is_team_member());
