-- Isolated client editing ledger. No browser role can read prompts, costs or files.
create table public.gallery_edit_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  allowance_cents integer not null default 100 check (allowance_cents between 100 and 10000),
  order_budget_cents integer not null default 1000 check (order_budget_cents between 100 and 100000),
  daily_budget_cents integer not null default 5000 check (daily_budget_cents between 100 and 1000000)
);
insert into public.gallery_edit_settings(id) values(true);
create table public.gallery_edit_accounts (
  order_id uuid primary key references public.orders(id) on delete cascade,
  remaining integer not null default 5 check (remaining between 0 and 100),
  attempts integer not null default 0,
  reserved_spend_cents integer not null default 0
);
create table public.gallery_edit_days (
  day date primary key,
  reserved_spend_cents integer not null default 0
);
create table public.gallery_edits (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_link_id uuid not null references public.delivery_links(id),
  photo_id uuid not null references public.photos(id),
  operation text not null check (operation in ('declutter','virtual_stage')),
  options jsonb not null,
  credits integer not null check (credits in (1,2)),
  status text not null default 'queued' check (status in ('queued','running','review','approved','rejected','failed')),
  allowance_cents integer not null,
  source_bucket text not null,
  source_path text not null,
  source_filename text not null,
  output_path text,
  model text,
  usage jsonb,
  estimated_cost_cents integer,
  error_code text,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gallery_edits_order_created on public.gallery_edits(order_id,created_at desc);
create index gallery_edits_pending on public.gallery_edits(status,created_at) where status in ('queued','running','review');
alter table public.gallery_edit_settings enable row level security;
alter table public.gallery_edit_accounts enable row level security;
alter table public.gallery_edit_days enable row level security;
alter table public.gallery_edits enable row level security;
revoke all on public.gallery_edit_settings,public.gallery_edit_accounts,public.gallery_edit_days,public.gallery_edits from public,anon,authenticated;
grant all on public.gallery_edit_settings,public.gallery_edit_accounts,public.gallery_edit_days,public.gallery_edits to service_role;

create function public.reserve_gallery_edit(p_token text,p_id uuid,p_photo_id uuid,p_operation text,p_options jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  l public.delivery_links; o public.orders; p public.photos; prior public.gallery_edits;
  cfg public.gallery_edit_settings; a public.gallery_edit_accounts;
  cost integer; daily integer;
begin
  select * into l from public.delivery_links where token=p_token;
  if not found or (l.expires_at is not null and l.expires_at<=now()) then raise exception 'gallery_unavailable'; end if;
  select * into o from public.orders where id=l.order_id;
  if not found or o.listing_id is null then raise exception 'gallery_unavailable'; end if;
  if coalesce(o.total_cents,0)>0 and o.download_paid_at is null then raise exception 'payment_required'; end if;
  -- Serialize reservations globally: budgets and per-order balances cannot overspend concurrently.
  select * into cfg from public.gallery_edit_settings where id=true for update;
  if not found then raise exception 'editing_unavailable'; end if;
  select * into prior from public.gallery_edits where id=p_id;
  if found then
    if prior.order_id<>o.id or prior.photo_id<>p_photo_id or prior.operation<>p_operation or prior.options<>p_options then raise exception 'request_conflict'; end if;
    return jsonb_build_object('id',prior.id,'status',prior.status,'replay',true);
  end if;
  if not cfg.enabled then raise exception 'editing_paused'; end if;
  if p_operation is null or p_operation not in ('declutter','virtual_stage') or p_options is null or jsonb_typeof(p_options)<>'object' then raise exception 'invalid_options'; end if;
  cost:=case when p_operation='virtual_stage' then 2 else 1 end;
  select * into p from public.photos where id=p_photo_id and order_id=o.id and kind in ('processed','delivered') and is_selected;
  if not found or (p.is_hdr is true and p.ai_provider='oceano-enhance') then raise exception 'photo_unavailable'; end if;
  insert into public.gallery_edit_accounts(order_id) values(o.id) on conflict do nothing;
  select * into a from public.gallery_edit_accounts where order_id=o.id for update;
  if a.remaining<cost then raise exception 'insufficient_credits'; end if;
  if exists(select 1 from public.gallery_edits where order_id=o.id and status in ('queued','running','review')) then raise exception 'edit_in_progress'; end if;
  if (select count(*) from public.gallery_edits where order_id=o.id and created_at>now()-interval '15 minutes')>=3 then raise exception 'rate_limited'; end if;
  if a.attempts>=10 or a.reserved_spend_cents+cfg.allowance_cents>cfg.order_budget_cents then raise exception 'order_limit'; end if;
  insert into public.gallery_edit_days(day) values((now() at time zone 'America/New_York')::date) on conflict do nothing;
  select reserved_spend_cents into daily from public.gallery_edit_days where day=(now() at time zone 'America/New_York')::date for update;
  if daily+cfg.allowance_cents>cfg.daily_budget_cents then raise exception 'daily_limit'; end if;
  update public.gallery_edit_days set reserved_spend_cents=reserved_spend_cents+cfg.allowance_cents where day=(now() at time zone 'America/New_York')::date;
  update public.gallery_edit_accounts set remaining=remaining-cost,attempts=attempts+1,reserved_spend_cents=reserved_spend_cents+cfg.allowance_cents where order_id=o.id;
  insert into public.gallery_edits(id,order_id,delivery_link_id,photo_id,operation,options,credits,allowance_cents,source_bucket,source_path,source_filename)
    values(p_id,o.id,l.id,p.id,p_operation,p_options,cost,cfg.allowance_cents,p.bucket,p.storage_path,p.filename);
  return jsonb_build_object('id',p_id,'status','queued','replay',false);
end $$;

-- Refund exactly once. Budget/attempt counters are intentionally NEVER refunded:
-- rejected images and ambiguous provider timeouts can still incur real costs.
create function public.settle_gallery_edit(p_id uuid,p_status text,p_actor uuid default null)
returns text language plpgsql security invoker set search_path=public as $$
declare e public.gallery_edits;
begin
  select * into e from public.gallery_edits where id=p_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_status is null or p_status not in ('approved','rejected','failed') then raise exception 'invalid_status'; end if;
  if e.status in ('approved','rejected','failed') then
    if e.status=p_status then return e.status; end if;
    raise exception 'already_settled';
  end if;
  if p_status in ('approved','rejected') and (e.status<>'review' or p_actor is null) then raise exception 'not_reviewable'; end if;
  if p_status='approved' and e.output_path is null then raise exception 'missing_output'; end if;
  if p_status='failed' and e.status not in ('queued','running') then raise exception 'not_running'; end if;
  if p_status in ('rejected','failed') then
    update public.gallery_edit_accounts set remaining=remaining+e.credits where order_id=e.order_id;
  end if;
  update public.gallery_edits set status=p_status,reviewed_by=p_actor,updated_at=now() where id=p_id;
  return p_status;
end $$;
revoke all on function public.reserve_gallery_edit(text,uuid,uuid,text,jsonb),public.settle_gallery_edit(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_gallery_edit(text,uuid,uuid,text,jsonb),public.settle_gallery_edit(uuid,text,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gallery-edits','gallery-edits',false,20971520,array['image/jpeg']) on conflict(id) do nothing;
-- No storage policies: service-role route handlers are the only readers/writers.
