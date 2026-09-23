-- Apply after the crew-window application release, which upserts by role.
alter table public.order_calendar_events drop constraint order_calendar_events_order_id_calendar_id_key;
