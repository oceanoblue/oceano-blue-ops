-- Browser sessions need connection health, never reusable OAuth credentials.
-- Existing calendar/booking workers use service_role and retain access.
revoke all privileges on public.team_calendar_connections from public, anon, authenticated;
revoke select (access_token, refresh_token), insert (access_token, refresh_token),
  update (access_token, refresh_token), references (access_token, refresh_token)
  on public.team_calendar_connections from public, anon, authenticated;
grant select (id, team_member_id, provider, account_email, expires_at,
  scope, primary_calendar_id, is_active, last_synced_at, created_at, updated_at)
  on public.team_calendar_connections to authenticated;
grant all privileges on public.team_calendar_connections to service_role;
-- Preserve existing own/admin metadata visibility. All writes are server-only.
drop policy if exists "self rw calendar connection" on public.team_calendar_connections;
