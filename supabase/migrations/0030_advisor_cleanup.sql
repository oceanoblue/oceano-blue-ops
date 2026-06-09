-- 0030_advisor_cleanup.sql
-- Prepared 2026-06-09. OWNER APPLIES THIS — do not auto-merge/apply.
-- Apply via the manual db-migrate workflow (.github/workflows/db-migrate.yml), dry-run first.
--
-- Clears the two remaining SQL-fixable security-advisor WARNs:
--   1. extension_in_public  — citext lives in `public`; move it to `extensions`.
--   2. public_bucket_allows_listing — the `public-assets` bucket has a broad
--      anon-readable SELECT policy on storage.objects that lets clients enumerate
--      every file. Public buckets don't need it: object URLs are served via the
--      public CDN endpoint (bucket.public = true), independent of this policy.
--
-- The third remaining WARN, auth_leaked_password_protection, is an Auth dashboard
-- toggle (not SQL) and is handled manually — see the PR description.
--
-- Additive/idempotent. No table data changes.

begin;

-- 1) Move citext out of the public schema.
--    Verified on local PG16: existing citext columns (clients/team_members/
--    user_profiles .email) and their case-insensitive UNIQUE indexes keep working
--    after the move, and `extensions` is already in the DB search_path so
--    unqualified `citext` continues to resolve.
--    Guarded: if this Supabase role isn't permitted to move an extension owned by
--    supabase_admin, the move is skipped (caught savepoint rollback) without
--    failing the migration — the rest still applies. If skipped, it can be moved
--    later from the dashboard SQL editor as a privileged role.
do $$
declare
  cur text;
begin
  select n.nspname into cur
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'citext';

  if cur is null then
    raise notice 'citext not installed — nothing to move';
  elsif cur = 'extensions' then
    raise notice 'citext already in extensions — nothing to do';
  else
    if not exists (select 1 from pg_namespace where nspname = 'extensions') then
      create schema extensions;
    end if;
    begin
      execute 'alter extension citext set schema extensions';
      raise notice 'moved citext from % to extensions', cur;
    exception
      when insufficient_privilege then
        raise notice 'skip: insufficient privilege to move citext (move from dashboard SQL editor instead)';
    end;
  end if;
end $$;

-- 2) Stop the public-assets bucket from being listable by anonymous clients.
--    Dropping this SELECT policy does NOT affect public object URLs (getPublicUrl
--    serves via the public CDN path on a public bucket). Nothing in the app calls
--    .list() on this bucket (verified). Re-adding a team-scoped SELECT policy later
--    is trivial if the UI ever needs to enumerate brand assets.
drop policy if exists "public read assets" on storage.objects;

commit;

-- Verify after applying:
--   -- citext should now report schema 'extensions' (or stay 'public' if the move
--   -- was skipped for privilege reasons — check the NOTICE in the apply log):
--   select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace
--   where e.extname='citext';
--   -- the broad public-assets SELECT policy should be gone:
--   select policyname from pg_policies
--   where schemaname='storage' and tablename='objects' and policyname='public read assets';
--   -- then re-run get_advisors(security): extension_in_public and
--   -- public_bucket_allows_listing should clear (if citext move applied).
--   -- SPOT-CHECK: load a public-assets object URL in a browser — must still resolve.
