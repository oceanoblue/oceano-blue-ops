-- Server callers are unchanged. PUBLIC grants are inherited by both API roles.
begin;
set local lock_timeout = '5s';

revoke execute on function public.add_order_items_priced(uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.add_order_items_priced(uuid, jsonb, integer) to service_role;

-- The public HTTP booking handler validates/rate-limits before using service_role.
revoke execute on function public.create_booking_v2(text,text,text,text,text,text,text,text,text,double precision,double precision,integer,timestamptz,integer,text,text,text,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.create_booking_v2(text,text,text,text,text,text,text,text,text,double precision,double precision,integer,timestamptz,integer,text,text,text,jsonb,uuid)
  to service_role;

alter function public.is_team_member() set search_path = public;

create or replace view public.v_assignment_responses
with (security_invoker = true, security_barrier = true) as
select o.order_number,
       c.full_name as contractor,
       o.contractor_response as response,
       o.contractor_responded_at as responded_at,
       o.contractor_response_note as note,
       (l.address_line1 || ', ') || l.city as property,
       o.scheduled_at, o.status
from public.orders o
join public.contractors c on c.id = o.contractor_id
join public.listings l on l.id = o.listing_id
where o.contractor_response is not null and o.archived_at is null
  and (current_user in ('service_role', 'postgres') or (select public.is_team_member()));

revoke all on public.v_assignment_responses from public, anon, authenticated;
grant select on public.v_assignment_responses to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.add_order_items_priced(uuid,jsonb,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.add_order_items_priced(uuid,jsonb,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.add_order_items_priced(uuid,jsonb,integer)', 'EXECUTE') then
    raise exception 'pricing RPC privilege verification failed';
  end if;
  if has_table_privilege('anon', 'public.v_assignment_responses', 'SELECT')
     or not has_table_privilege('authenticated', 'public.v_assignment_responses', 'SELECT')
     or not has_table_privilege('service_role', 'public.v_assignment_responses', 'SELECT') then
    raise exception 'assignment view privilege verification failed';
  end if;
end;
$$;
commit;
