-- =============================================================
-- 0081 — Photographers are field, not office
-- =============================================================
-- A team_members row with role = 'photographer' exists for SCHEDULING (they can
-- be assigned, their availability / double-book guard / calendar hold work) —
-- not so they can read every order, client, listing, and price. Until now
-- is_team_member() said "yes" for them, and every "team rw …" RLS policy hangs
-- off that one function, so a photographer's session had full office access at
-- the database level (and saw the whole company in the client portal).
--
-- Office access = active admin / coordinator / editor. Photographers use the
-- field portal, whose reads go through the contractor-scoped field_orders view
-- and SECURITY DEFINER RPCs, none of which depend on is_team_member().
--
-- The middleware applies the same rule at the app layer (role check on the
-- caller's own team_members row); this makes the database agree with it.
-- =============================================================

create or replace function is_team_member()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from team_members
    where id = auth.uid()
      and is_active = true
      and role <> 'photographer'
  );
$$;
