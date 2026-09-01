-- =============================================================
-- 0073 — Fix infinite recursion in client_team_members / client_teams RLS
-- =============================================================
-- 0067's client policies inlined a subquery over client_team_members INSIDE the
-- policy ON client_team_members:
--   team_id in (select ctm.team_id from client_team_members ctm join clients c …)
-- Evaluating that policy re-reads client_team_members, which re-evaluates the
-- policy → "infinite recursion detected in policy for relation
-- client_team_members" on every read (it broke the Teams page for staff too,
-- since permissive policies are all evaluated).
--
-- Fix: do the membership lookup in a SECURITY DEFINER function, which reads the
-- table WITHOUT re-triggering RLS, and reference it from both policies. Same
-- access semantics (a client sees the teams they belong to and their co-members),
-- no recursion.
-- =============================================================

create or replace function current_client_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ctm.team_id
  from client_team_members ctm
  join clients c on c.id = ctm.client_id
  where c.auth_user_id = auth.uid()
$$;

revoke all on function current_client_team_ids() from public, anon;
grant execute on function current_client_team_ids() to authenticated;

-- Rewrite the two recursive policies to use the definer function.
drop policy if exists "client read own team members" on client_team_members;
create policy "client read own team members" on client_team_members
  for select using (team_id in (select current_client_team_ids()));

drop policy if exists "client read own teams" on client_teams;
create policy "client read own teams" on client_teams
  for select using (id in (select current_client_team_ids()));
