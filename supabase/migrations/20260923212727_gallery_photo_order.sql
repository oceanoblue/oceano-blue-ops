-- Atomic, staff-only gallery ordering. This never updates orders or dispatches notifications.
create or replace function public.set_gallery_photo_order(p_order uuid, p_ids uuid[], p_expected jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare current_order jsonb;
begin
  if public.is_team_member() is not true then raise exception 'forbidden'; end if;
  -- Serialize sort requests; photo row locks protect concurrent photo mutations.
  perform 1 from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  perform 1 from public.photos where order_id = p_order order by id for update;
  select coalesce(jsonb_object_agg(id::text, sort_order), '{}'::jsonb)
    into current_order from public.photos where order_id = p_order;
  if current_order is distinct from p_expected then raise exception 'gallery_changed'; end if;
  if p_ids is null or cardinality(p_ids) = 0
    or cardinality(p_ids) <> (select count(*) from public.photos where order_id = p_order)
    or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) as t(id))
    or exists(select 1 from unnest(p_ids) as t(id) where id is null or not exists(
      select 1 from public.photos p where p.id = t.id and p.order_id = p_order))
  then raise exception 'invalid_photo_ids'; end if;
  update public.photos p set sort_order = ordered.position::int
    from unnest(p_ids) with ordinality as ordered(id, position)
    where p.id = ordered.id and p.order_id = p_order;
end;
$$;
revoke all on function public.set_gallery_photo_order(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.set_gallery_photo_order(uuid, uuid[], jsonb) to authenticated;
