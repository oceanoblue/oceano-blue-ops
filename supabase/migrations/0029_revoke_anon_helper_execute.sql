-- 0029_revoke_anon_helper_execute.sql
-- Prepared 2026-06-09. OWNER APPLIES THIS — do not auto-merge/apply.
-- Apply via the manual db-migrate workflow (.github/workflows/db-migrate.yml), dry-run first.
--
-- Purpose: clear the `anon_security_definer_function_executable` advisor WARNs for
-- the four internal helper predicates. By default every function carries an EXECUTE
-- grant to PUBLIC, which PostgREST exposes at /rest/v1/rpc/<fn> to the anon role.
-- These helpers are internal plumbing (used inside RLS policies and, for two of
-- them, called by signed-in portal users) and should NOT be callable by logged-out
-- visitors.
--
-- Mechanism (verified on local PG16): role privileges are ADDITIVE, so
-- `revoke ... from anon` alone is a no-op while the PUBLIC grant stands. The real
-- denial is `revoke ... from public`; because that also strips `authenticated` and
-- `service_role`, we immediately re-grant to them so the app keeps working.
--
-- Safety (verified against the codebase): anon (logged-out) NEVER does a direct
-- PostgREST table read or RPC in this app — app/book, app/gallery, app/login and
-- app/portal go through server API routes (service role) or auth-only calls. So the
-- "permission denied for function in an RLS policy" path that would affect anon
-- table reads is never exercised.
--
-- What this deliberately does NOT touch:
--   * create_booking_v2 / create_draft_order — must stay anon-callable (public
--     booking form posts to these SECURITY DEFINER RPCs).
--   * The matching `authenticated_security_definer_function_executable` WARNs —
--     authenticated genuinely needs EXECUTE on these (RLS evaluation + portal RPC),
--     so those advisor entries are expected to remain.
--
-- Additive and idempotent: re-running is a no-op. No table data changes.

begin;

do $$
declare
  fn text;
  sigs text[] := array[
    'public.is_internal_user()',
    'public.is_team_member()',
    'public.current_client_id()',
    'public.link_client_account()'
  ];
  has_service_role boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  has_authenticated boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
begin
  foreach fn in array sigs loop
    begin
      -- Remove the implicit public exposure (this is what the advisor flags via anon).
      execute format('revoke execute on function %s from public', fn);
      if has_anon then
        execute format('revoke execute on function %s from anon', fn);
      end if;

      -- Re-grant to the roles that legitimately need it so RLS + portal RPCs keep working.
      if has_authenticated then
        execute format('grant execute on function %s to authenticated', fn);
      end if;
      if has_service_role then
        execute format('grant execute on function %s to service_role', fn);
      end if;
    exception
      when undefined_function then
        raise notice 'skip (not found): %', fn;
    end;
  end loop;
end $$;

commit;

-- Verify after applying:
--   -- anon should NO LONGER be able to execute these (acl loses the public/anon entry):
--   select p.proname, p.proacl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('is_internal_user','is_team_member','current_client_id','link_client_account');
--   -- and re-run get_advisors(security): the four anon_security_definer_function_executable
--   -- WARNs for these helpers should be gone. The authenticated_* WARNs are expected to remain.
