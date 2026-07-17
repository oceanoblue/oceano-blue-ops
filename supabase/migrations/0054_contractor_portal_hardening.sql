-- =============================================================
-- 0054 — Contractor portal security hardening
-- =============================================================
-- Advisor follow-ups on the 0053 surface:
--   * Pin search_path on the SQL definer helper (avoid a malicious
--     session search_path redirecting the unqualified `contractors` ref).
--   * Drop the default PUBLIC/anon EXECUTE on the two ownership helpers so
--     only signed-in users can call them (matches the client-portal helpers).
-- =============================================================

alter function current_contractor_id() set search_path = public;

revoke all on function current_contractor_id() from public, anon;
revoke all on function link_contractor_account() from public, anon;
grant execute on function current_contractor_id() to authenticated;
grant execute on function link_contractor_account() to authenticated;
