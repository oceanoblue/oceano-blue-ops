-- Track the Google Calendar event id we pushed for each order so we can
-- update / delete it later when the order changes.
alter table orders
  add column if not exists gcal_event_id text;
