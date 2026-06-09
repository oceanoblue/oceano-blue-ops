-- 0028_security_hardening.sql
-- Prepared by Cowork agent on 2026-06-08. OWNER APPLIES THIS — do not auto-merge/apply.
-- Apply via the manual db-migrate workflow (.github/workflows/db-migrate.yml), dry-run first.
--
-- Purpose: clear the actionable findings from `get_advisors(security)` without
-- touching application code. Additive and idempotent — re-running is a no-op.
-- No table data is changed. No new columns. Safe to roll forward.
--
-- What this does NOT touch (see DB_HEALTH_REPORT §5 for why):
--   * anon EXECUTE on create_booking_v2 / create_draft_order (intentional, public booking form)
--   * citext-in-public, public-assets bucket listing (low priority, risky to retrofit)
--   * leaked-password protection (an Auth dashboard toggle, not SQL)
--   * performance advisors / FK indexes (deferred until there is query volume)

begin;

-- 1) Fix the one ERROR: pipeline_counts is a SECURITY DEFINER view, which bypasses
--    the querying user's RLS. The view is internal-only (Command Center / legacy
--    dashboard reads it as a signed-in internal user), so invoker semantics are correct.
--    REVIEW: after applying, confirm the dashboard still renders status counts.
do $$
begin
  if exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'pipeline_counts'
  ) then
    execute 'alter view public.pipeline_counts set (security_invoker = true)';
  end if;
end $$;

-- 2) Pin search_path on the flagged functions (function_search_path_mutable WARN).
--    `= public` is non-breaking: unqualified references still resolve to public,
--    and for SECURITY DEFINER functions it removes the search-path injection vector.
--    (Stricter option for later: `= ''` with fully schema-qualified bodies — only
--    do that after auditing each function body.)
--    Each ALTER is guarded so a missing/renamed function won't fail the migration.
do $$
declare
  fn text;
  sigs text[] := array[
    'public.is_internal_user()',
    'public.is_team_member()',
    'public.current_client_id()',
    'public.link_client_account()',
    'public.set_updated_at()',
    'public.price_for_sqft(uuid, integer)',
    'public.create_draft_order(text, text, text, text, text, text, text, text, integer, numeric, integer, timestamptz, text[], text)',
    'public.create_booking_v2(text, text, text, text, text, text, text, text, text, double precision, double precision, integer, timestamptz, integer, text, text, text, jsonb)'
  ];
begin
  foreach fn in array sigs loop
    begin
      execute format('alter function %s set search_path = public', fn);
    exception
      when undefined_function then
        raise notice 'skip (not found): %', fn;
    end;
  end loop;
end $$;

commit;

-- Verify after applying (should return zero rows for the two clusters fixed above):
--   select * from <get_advisors security>  -- via MCP / dashboard
--   -- functions still missing a pinned search_path:
--   select p.proname, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('is_internal_user','is_team_member','current_client_id',
--                       'link_client_account','set_updated_at','price_for_sqft',
--                       'create_draft_order','create_booking_v2')
--     and p.proconfig is null;
--   -- pipeline_counts should now report reloptions security_invoker=true:
--   select relname, reloptions from pg_class where relname = 'pipeline_counts';
