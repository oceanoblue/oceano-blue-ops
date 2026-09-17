-- A gallery preview does not mark an order delivered or send notifications.
create table public.gallery_dispatches (
 id uuid primary key,
 order_id uuid not null references public.orders(id) on delete cascade,
 delivery_link_id uuid references public.delivery_links(id),
 created_by uuid not null references public.team_members(id),
 is_test boolean not null default false,
 fingerprint text not null,
 message text not null default '',
 recipients jsonb not null check (jsonb_typeof(recipients) = 'array'),
 status text not null default 'prepared' check (status in ('prepared','sending','sent','partial','needs_review','failed')),
 created_at timestamptz not null default now(), completed_at timestamptz
);
create index gallery_dispatches_order_created_idx on public.gallery_dispatches(order_id, created_at desc);
create index gallery_dispatches_link_idx on public.gallery_dispatches(delivery_link_id);
create index gallery_dispatches_actor_idx on public.gallery_dispatches(created_by);
alter table public.gallery_dispatches enable row level security;
revoke all on public.gallery_dispatches from anon, authenticated;
grant select on public.gallery_dispatches to authenticated;
grant all on public.gallery_dispatches to service_role;
create policy "office reads gallery sends" on public.gallery_dispatches for select to authenticated using (public.is_team_member());

-- Invoker functions are service-role only; HTTP handlers authorize office staff.
create function public.prepare_gallery_link(p_order uuid, p_actor uuid, p_token text)
returns public.delivery_links language plpgsql security invoker set search_path=public as $$
declare v_link public.delivery_links;
begin
 perform 1 from public.orders where id=p_order for update;
 if not found then raise exception 'order_not_found'; end if;
 select * into v_link from public.delivery_links where order_id=p_order
  and (expires_at is null or expires_at > now()+interval '1 day') order by created_at desc limit 1;
 if v_link.id is null then
  insert into public.delivery_links(order_id,created_by,token) values(p_order,p_actor,p_token) returning * into v_link;
 end if;
 return v_link;
end $$;
revoke all on function public.prepare_gallery_link(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.prepare_gallery_link(uuid,uuid,text) to service_role;

create function public.prepare_gallery_dispatch(p_id uuid,p_order uuid,p_actor uuid,p_token text,
 p_fingerprint text,p_message text,p_recipients jsonb,p_test boolean,p_resend boolean)
returns public.gallery_dispatches language plpgsql security invoker set search_path=public as $$
declare d public.gallery_dispatches; l public.delivery_links;
begin
 perform 1 from public.orders where id=p_order for update;
 if not found then raise exception 'order_not_found'; end if;
 select * into d from public.gallery_dispatches where id=p_id;
 if found then
  if d.order_id<>p_order or d.fingerprint<>p_fingerprint then raise exception 'request_changed'; end if;
  return d;
 end if;
 if exists(select 1 from public.gallery_dispatches where order_id=p_order and is_test=p_test
  and status in ('prepared','sending') and created_at>now()-interval '5 minutes') then raise exception 'delivery_in_progress'; end if;
 if not p_test and not p_resend and exists(select 1 from public.gallery_dispatches where order_id=p_order and not is_test) then raise exception 'confirm_resend'; end if;
 if jsonb_array_length(p_recipients)<1 or jsonb_array_length(p_recipients)>25 then raise exception 'invalid_recipients'; end if;
 if not p_test then l:=public.prepare_gallery_link(p_order,p_actor,p_token); end if;
 insert into public.gallery_dispatches(id,order_id,delivery_link_id,created_by,is_test,fingerprint,message,recipients)
  values(p_id,p_order,l.id,p_actor,p_test,p_fingerprint,p_message,p_recipients) returning * into d;
 return d;
end $$;
revoke all on function public.prepare_gallery_dispatch(uuid,uuid,uuid,text,text,text,jsonb,boolean,boolean) from public, anon, authenticated;
grant execute on function public.prepare_gallery_dispatch(uuid,uuid,uuid,text,text,text,jsonb,boolean,boolean) to service_role;

create function public.finish_gallery_dispatch(p_id uuid)
returns public.gallery_dispatches language plpgsql security invoker set search_path=public as $$
declare d public.gallery_dispatches; v_status text;
begin
 select * into d from public.gallery_dispatches where id=p_id for update;
 if d.id is null then raise exception 'dispatch_not_found'; end if;
 if d.status<>'sending' then return d; end if;
 if exists(select 1 from jsonb_array_elements(d.recipients) r where r->>'status' in ('pending','sending','needs_review')) then v_status:='needs_review';
 elsif not exists(select 1 from jsonb_array_elements(d.recipients) r where r->>'status'<>'accepted') then v_status:='sent';
 elsif exists(select 1 from jsonb_array_elements(d.recipients) r where r->>'status'='accepted') then v_status:='partial';
 else v_status:='failed'; end if;
 update public.gallery_dispatches set status=v_status,completed_at=now() where id=p_id returning * into d;
 if v_status='sent' and not d.is_test then
  update public.orders set status='delivered',delivered_at=coalesce(delivered_at,now()) where id=d.order_id;
  update public.listings set status='delivered' where id=(select listing_id from public.orders where id=d.order_id);
 end if;
 return d;
end $$;
revoke all on function public.finish_gallery_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.finish_gallery_dispatch(uuid) to service_role;
