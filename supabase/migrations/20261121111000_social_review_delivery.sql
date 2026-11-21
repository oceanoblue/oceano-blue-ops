-- Existing records keep their stages. To release a legacy item, review its current revision.
alter table public.social_programs add column publishing_enabled boolean not null default false, add column approval_mode text not null default 'individual'
  check (approval_mode in ('office','individual','batch'));
alter table public.social_accounts add column publishing_timezone text not null default '', add column provider_destinations jsonb not null default '{}'
  check (jsonb_typeof(provider_destinations)='object');
alter table public.social_content_items
  add column publish_time time,
  add column review_revision integer not null default 1 check (review_revision>0),
  add column approved_revision integer,
  add column approved_by_role text check (approved_by_role in ('office','client')),
  add column creative_path text,
  add column creative_type text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
  values ('social-creative','social-creative',false,209715200,
    array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
  on conflict (id) do nothing;

create table public.social_review_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.social_content_items(id),
  revision integer not null, event text not null check(event in ('approved','changes','handled')),
  actor_name text not null, actor_id uuid references public.team_members(id),
  note text not null default '', snapshot jsonb not null, created_at timestamptz not null default now()
);

create table public.social_deliveries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.social_content_items(id), revision integer not null,
  platform text not null, destination text not null, state text not null
    check (state in ('claimed','scheduled','published','failed','uncertain')),
  claim_id uuid not null default gen_random_uuid(), lease_until timestamptz not null,
  attempts integer not null default 1, provider_id text, live_url text not null default '',
  detail text not null default '', updated_at timestamptz not null default now(),
  unique (item_id,revision,platform)
);
create table public.social_delivery_events (
  id uuid primary key default gen_random_uuid(), delivery_id uuid not null references public.social_deliveries(id),
  attempt integer not null, state text not null, provider_id text, detail text not null default '', live_url text not null default '',
  created_at timestamptz not null default now()
);
create index social_delivery_events_delivery on public.social_delivery_events(delivery_id,created_at);
alter table public.social_delivery_events enable row level security;
revoke all on public.social_delivery_events from public,anon,authenticated;
grant select,insert on public.social_delivery_events to service_role;
create index social_review_events_item on public.social_review_events(item_id,created_at);
create unique index social_provider_receipt on public.social_deliveries(platform,destination,provider_id)
  where provider_id is not null;
alter table public.social_review_events enable row level security;
alter table public.social_deliveries enable row level security;
revoke all on public.social_review_events,public.social_deliveries from public,anon,authenticated;
grant select,insert on public.social_review_events to service_role;
grant select,insert,update on public.social_deliveries to service_role;

create function public.social_item_revision() returns trigger language plpgsql set search_path='' as $$
declare changed boolean;
begin
  changed := row(new.title,new.caption,new.pillar,new.scheduled_for,new.design_url,new.creative_path,new.kind,new.account_id,new.publish_time)
    is distinct from row(old.title,old.caption,old.pillar,old.scheduled_for,old.design_url,old.creative_path,old.kind,old.account_id,old.publish_time)
    or new.review_revision<>old.review_revision;
  if old.status in ('scheduled','published') and old.status<>new.status and not (old.status='scheduled' and new.status='published') then
    raise exception using errcode='P0001',message='Reconcile the published or scheduled piece at the provider.';
  end if;
  if changed or (new.status in ('planned','needs_media','in_design','internal_review','client_review') and old.status<>new.status) then
    new.review_revision := old.review_revision + 1;
    new.approved_revision := null;
    new.approved_by_role := null;
    if old.client_decision='approved' then new.client_decision := ''; end if;
    -- Historical delivered rows retain their stage. New content must be a new piece after posting.
    if changed and old.status in ('scheduled','published') then
      raise exception using errcode='P0001', message='A scheduled or live piece must be updated at the publisher. Create a new piece for a new delivery.';
    end if;
    if new.status='approved' then new.status:='client_review'; end if;
  end if;
  return new;
end $$;
create trigger social_review_revision before update on public.social_content_items for each row execute function public.social_item_revision();

-- A destination change affects the review even when caption and file stayed the same.
create function public.social_destinations_changed() returns trigger language plpgsql set search_path='' as $$
begin
  if row(new.platforms,new.profile_links,new.provider_destinations,new.publishing_timezone) is distinct from
     row(old.platforms,old.profile_links,old.provider_destinations,old.publishing_timezone) then
    update public.social_content_items set review_revision=review_revision+1, updated_at=now()
      where account_id=new.id and status not in ('scheduled','published');
  end if;
  return new;
end $$;
create trigger social_destinations_changed after update on public.social_accounts for each row execute function public.social_destinations_changed();

create function public.social_approval_mode_changed() returns trigger language plpgsql set search_path='' as $$
begin
  if new.approval_mode<>old.approval_mode then
    update public.social_content_items i set review_revision=i.review_revision+1,updated_at=now()
      from public.social_accounts a where i.account_id=a.id and a.program_id=new.id and i.status not in ('scheduled','published');
  end if;
  return new;
end $$;
create trigger social_approval_mode_changed after update of approval_mode on public.social_programs
  for each row execute function public.social_approval_mode_changed();

create function public.social_review_items(p_program uuid,p_account uuid,p_month date,p_items jsonb,
  p_role text,p_name text,p_actor uuid,p_event text,p_note text,p_token text)
returns integer language plpgsql set search_path='' as $$
declare
  program public.social_programs; account public.social_accounts; item public.social_content_items;
  wanted record; n integer:=0; snapshot jsonb;
begin
  select * into program from public.social_programs where id=p_program for share;
  select * into account from public.social_accounts where id=p_account and program_id=p_program and is_active for share;
  if program.id is null or account.id is null or program.status not in ('onboarding','active') or
     (p_role='client' and (program.report_token is null or program.report_token is distinct from p_token)) then
    raise exception using errcode='P0002',message='This page or account is unavailable.';
  end if;
  if p_role not in ('office','client') or p_event not in ('approved','changes','handled') or
     (p_role='office' and not exists(select 1 from public.team_members t where t.id=p_actor and t.is_active and t.role::text in ('admin','coordinator'))) or
     (p_role='client' and (p_event='handled' or (p_event='approved' and program.approval_mode='office'))) or
     (p_role='office' and p_event='approved' and program.approval_mode<>'office') then
    raise exception using errcode='P0001',message='This approval belongs to the reviewer selected for the client.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 150 or
     (jsonb_array_length(p_items)>1 and (p_event<>'approved' or program.approval_mode<>'batch')) or
     (select count(distinct x.id) from jsonb_to_recordset(p_items) x(id uuid,revision integer))<>jsonb_array_length(p_items) then
    raise exception using errcode='P0001',message='Reload the page and select the revisions to review.';
  end if;
  for wanted in select * from jsonb_to_recordset(p_items) x(id uuid,revision integer) order by id loop
    select * into item from public.social_content_items where id=wanted.id and account_id=account.id and month=p_month for update;
    if item.id is null then raise exception using errcode='P0002',message='Piece unavailable.'; end if;
    if item.review_revision is distinct from wanted.revision then raise exception using errcode='P0001',message='The piece changed. Reload and review the current version.'; end if;
    if p_event='approved' and
       ((p_role='client' and item.status<>'client_review') or
        (p_role='office' and item.status not in ('internal_review','client_review')) or
        item.creative_path is null or btrim(item.caption)='' or item.client_decision='changes' or item.scheduled_for is null) then
      raise exception using errcode='P0001',message='Review the current caption, publish date and frozen creative before approval.';
    end if;
    if p_event='changes' and item.status not in ('client_review','approved','scheduled','published') then
      raise exception using errcode='P0002',message='Piece unavailable.';
    end if;
    if p_event='handled' and item.client_decision<>'changes' then
      raise exception using errcode='P0001',message='This request has already been handled.';
    end if;
    snapshot:=jsonb_build_object('title',item.title,'caption',item.caption,'creative_path',item.creative_path,
      'design_url',item.design_url,'publish_on',item.scheduled_for,'publish_time',item.publish_time,'timezone',account.publishing_timezone,'kind',item.kind,'platforms',account.platforms,
      'profile_links',account.profile_links,'destinations',account.provider_destinations);
    insert into public.social_review_events(item_id,revision,event,actor_name,actor_id,note,snapshot)
      values(item.id,item.review_revision,p_event,p_name,p_actor,p_note,snapshot);
    if p_event='approved' then
      update public.social_content_items set status='approved', approved_revision=item.review_revision,
        approved_by_role=p_role, client_decision=case when p_role='client' then 'approved' else '' end,
        client_reviewer=case when p_role='client' then p_name else '' end,
        client_reviewed_at=now(), client_note='', updated_at=now() where id=item.id;
    elsif p_event='changes' then
      update public.social_content_items set status=case when status='client_review' then 'in_design' else status end,
        approved_revision=null, approved_by_role=null, client_decision='changes',client_reviewer=p_name,client_note=p_note,
        client_reviewed_at=now(),updated_at=now() where id=item.id;
    else
      update public.social_content_items set client_decision='', approved_revision=null, approved_by_role=null,
        status=case when status='approved' then 'client_review' else status end,updated_at=now() where id=item.id;
    end if;
    n:=n+1;
  end loop;
  return n;
end $$;

-- Lock in program, account, item order throughout. GET discovery never reserves a delivery.
create function public.social_claim_delivery(p_program uuid,p_item uuid,p_revision integer,p_platform text,
  p_account_updated timestamptz,p_program_updated timestamptz,p_dry boolean)
returns jsonb language plpgsql set search_path='' as $$
declare
  program public.social_programs; account public.social_accounts; item public.social_content_items;
  delivery public.social_deliveries; dest text;
begin
  select * into program from public.social_programs where id=p_program for share;
  select a.* into account from public.social_accounts a join public.social_content_items i on i.account_id=a.id
    where i.id=p_item and a.program_id=p_program for share of a;
  select * into item from public.social_content_items where id=p_item and account_id=account.id for update;
  if item.id is null then raise exception using errcode='P0002',message='Piece unavailable.'; end if;
  dest:=nullif(trim(account.provider_destinations->>p_platform),'');
  if program.status<>'active' or (not p_dry and not program.publishing_enabled) or not account.is_active or account.access_status<>'connected'
    or program.updated_at is distinct from p_program_updated or account.updated_at is distinct from p_account_updated
    or item.client_decision='changes' or item.approved_revision is distinct from p_revision
    or item.review_revision<>p_revision or item.status not in ('approved','scheduled')
    or item.approved_by_role is distinct from (case when program.approval_mode='office' then 'office' else 'client' end)
    or item.publish_time is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=account.publishing_timezone)
    or dest is null or item.creative_path is null or item.scheduled_for is null or coalesce(trim(item.caption),'')=''
    or not (p_platform=any(account.platforms)) or ((item.kind='google_post')<>(p_platform='google')) then
    raise exception using errcode='P0001',message='Approval, client status, access, destination or creative has changed. Refresh the queue.';
  end if;
  if timezone(account.publishing_timezone,timezone(account.publishing_timezone,item.scheduled_for+item.publish_time))<>item.scheduled_for+item.publish_time then
    raise exception using errcode='P0001',message='Choose a local time that exists on this date.';
  end if;
  if not exists(select 1 from public.social_month_scope(p_program,item.month) scope where scope.account_id=account.id
      and item.slot <= case item.kind when 'post' then scope.posts_per_month when 'reel' then scope.reels_per_month else scope.google_posts_per_month end) then
    raise exception using errcode='P0001',message='This item falls outside the contracted scope for its month.';
  end if;
  if exists(select 1 from public.social_content_items peer where peer.account_id=item.account_id and peer.month=item.month
    and peer.id<>item.id and lower(regexp_replace(trim(peer.caption),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(item.caption),'[[:space:]]+',' ','g'))) then
    raise exception using errcode='P0001',message='Duplicate caption. Review this piece.';
  end if;
  if exists(select 1 from public.social_deliveries where item_id=item.id and revision<>p_revision
        and platform=p_platform and state in ('claimed','uncertain','scheduled','published')) then
    raise exception using errcode='P0001',message='Reconcile the previous revision with the provider before sending this destination.';
  end if;
  select * into delivery from public.social_deliveries where item_id=item.id and revision=p_revision and platform=p_platform for update;
  if delivery.id is not null and delivery.state<>'failed' then
    raise exception using errcode='P0001',message='This destination was already claimed. Reconcile the existing receipt.';
  end if;
  if p_dry then return jsonb_build_object('mode','test','dispatch',false,'platform',p_platform,'revision',p_revision); end if;
  if delivery.id is null then
    insert into public.social_deliveries(item_id,revision,platform,destination,state,lease_until)
      values(item.id,p_revision,p_platform,dest,'claimed',now()+interval '15 minutes') returning * into delivery;
  else
    update public.social_deliveries set claim_id=gen_random_uuid(), lease_until=now()+interval '15 minutes',
      attempts=attempts+1,state='claimed',provider_id=null,live_url='',detail='',updated_at=now() where id=delivery.id returning * into delivery;
  end if;
  insert into public.social_delivery_events(delivery_id,attempt,state) values(delivery.id,delivery.attempts,'claimed');
  return jsonb_build_object('mode','live','dispatch',true,'idempotency_key',delivery.id,'claim_id',delivery.claim_id,
    'lease_until',delivery.lease_until,'destination',dest,'platform',p_platform,'item_id',item.id,'revision',p_revision,
    'caption',item.caption,'creative_path',item.creative_path,'creative_type',item.creative_type,'publish_on',item.scheduled_for,'publish_at',timezone(account.publishing_timezone,item.scheduled_for+item.publish_time),'timezone',account.publishing_timezone);
end $$;

-- A timeout is uncertain. Only an explicit provider rejection or verified absence permits another send.
-- Late receipts still describe the original delivery. They never advance a different revision.
create function public.social_record_receipt(p_key uuid,p_claim uuid,p_event text,p_provider text,p_url text,p_detail text)
returns jsonb language plpgsql set search_path='' as $$
declare
  d public.social_deliveries; i public.social_content_items; a public.social_accounts;
  destinations text[]; complete boolean; scheduled boolean; next_state text;
begin
  select x.* into i from public.social_content_items x join public.social_deliveries y on y.item_id=x.id where y.id=p_key for update of x;
  select * into d from public.social_deliveries where id=p_key for update;
  if d.id is null or d.claim_id<>p_claim then raise exception using errcode='P0001',message='This claim no longer matches the delivery.'; end if;
  if p_event not in ('scheduled','published','failed','uncertain') or
     (p_event in ('scheduled','published') and coalesce(trim(p_provider),'')='') or
     (p_event='failed' and coalesce(trim(p_detail),'')='') or
     (d.provider_id is not null and nullif(p_provider,'') is not null and d.provider_id<>p_provider) then
    raise exception using errcode='P0001',message='A matching provider receipt or definitive rejection is required.';
  end if;
  if d.state=p_event or (d.state='published' and p_event='scheduled') then
    return jsonb_build_object('changed',false,'state',d.state);
  end if;
  if d.state in ('published','failed') or (d.state='scheduled' and p_event not in ('published','failed','uncertain')) then
    raise exception using errcode='P0001',message='Reconcile the existing provider receipt.';
  end if;
  update public.social_deliveries set state=p_event,provider_id=coalesce(nullif(p_provider,''),provider_id),
    live_url=coalesce(nullif(p_url,''),live_url),detail=p_detail,updated_at=now() where id=d.id;
  insert into public.social_delivery_events(delivery_id,attempt,state,provider_id,detail,live_url)
    values(d.id,d.attempts,p_event,nullif(p_provider,''),p_detail,p_url);
  if i.review_revision=d.revision and i.approved_revision=d.revision and i.status in ('approved','scheduled')
    and i.client_decision<>'changes' and p_event in ('scheduled','published') then
    select * into a from public.social_accounts where id=i.account_id;
    select array_agg(distinct platform) into destinations from unnest(a.platforms) platform
      where (i.kind='google_post')=(platform='google');
    select count(*)=cardinality(destinations) and bool_and(state='published'),
           count(*)=cardinality(destinations) and bool_and(state in ('scheduled','published'))
      into complete,scheduled from public.social_deliveries where item_id=i.id and revision=d.revision and platform=any(destinations);
    next_state:=case when complete then 'published' when scheduled then 'scheduled' else i.status end;
    if next_state<>i.status then update public.social_content_items set status=next_state,
      published_url=case when complete then coalesce((select nullif(live_url,'') from public.social_deliveries where item_id=i.id and revision=d.revision and live_url<>'' order by platform limit 1),'') else published_url end,
      updated_at=now() where id=i.id; end if;
  end if;
  return jsonb_build_object('changed',true,'state',p_event);
end $$;
revoke all on function public.social_review_items(uuid,uuid,date,jsonb,text,text,uuid,text,text,text),
  public.social_claim_delivery(uuid,uuid,integer,text,timestamptz,timestamptz,boolean),
  public.social_record_receipt(uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.social_review_items(uuid,uuid,date,jsonb,text,text,uuid,text,text,text),
  public.social_claim_delivery(uuid,uuid,integer,text,timestamptz,timestamptz,boolean),
  public.social_record_receipt(uuid,uuid,text,text,text,text) to service_role;
