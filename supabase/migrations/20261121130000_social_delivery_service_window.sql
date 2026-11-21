-- Check the actual publication date as well as the allocation month when reserving a destination.
create or replace function public.social_claim_delivery(p_program uuid,p_item uuid,p_revision integer,p_platform text,
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
  if not exists(select 1 from public.social_month_scope(p_program,date_trunc('month',item.scheduled_for)::date) scope
     where scope.account_id=account.id and item.scheduled_for>=scope.service_from and not scope.from_legacy_plan) then
    raise exception using errcode='P0001',message='The publishing date is outside the service window for this account.';
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
