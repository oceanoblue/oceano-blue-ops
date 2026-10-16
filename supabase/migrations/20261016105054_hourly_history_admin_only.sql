-- Retain the audit trail while restricting it to active office administrators.
alter policy hourly_event_read on public.contractor_hourly_events
  using (exists (
    select 1 from public.team_members t
    where t.id = (select auth.uid()) and t.is_active and t.role::text = 'admin'
  ));
