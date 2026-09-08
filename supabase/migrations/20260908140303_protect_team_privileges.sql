begin;
set local lock_timeout = '5s';
create function public.protect_team_privileges() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('postgres','service_role') and not public.is_team_admin()
    and (new.id is distinct from old.id or new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'Only an active admin can change team privileges' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_team_privileges() from public,anon,authenticated;
create trigger protect_team_privileges before update on public.team_members
for each row execute function public.protect_team_privileges();

alter policy "team_members admin update" on public.team_members
using (((select auth.uid()) = id) or (select public.is_team_admin()))
with check (((select auth.uid()) = id) or (select public.is_team_admin()));
commit;
