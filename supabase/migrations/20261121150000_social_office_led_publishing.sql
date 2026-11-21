-- Clients who let the office decide what to post ("office" approval), and clients
-- whose posts are scheduled by hand in a publishing tool rather than through the
-- automation bridge.
--
-- 1. The office can authorize a piece without an uploaded file. A client approval
--    still needs the frozen creative, because the client must see what they approve.
-- 2. The office can mark an authorized piece scheduled or live by hand, and reopen
--    it, for a client that is not on automated publishing. Every mark is recorded.

alter table public.social_review_events drop constraint social_review_events_event_check;
alter table public.social_review_events add constraint social_review_events_event_check
  check (event in ('approved','changes','handled','scheduled','published','reopened'));

create or replace function public.social_item_revision() returns trigger language plpgsql set search_path='' as $$
declare changed boolean;
begin
  changed := row(new.title,new.caption,new.pillar,new.scheduled_for,new.design_url,new.creative_path,new.kind,new.account_id,new.publish_time)
    is distinct from row(old.title,old.caption,old.pillar,old.scheduled_for,old.design_url,old.creative_path,old.kind,old.account_id,old.publish_time)
    or new.review_revision<>old.review_revision;
  -- A piece marked by hand can be reopened by the office (see social_mark_delivered).
  if old.status in ('scheduled','published') and old.status<>new.status and not (old.status='scheduled' and new.status='published')
     and coalesce(current_setting('social.manual_reopen', true),'')<>'on' then
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

create or replace function public.social_review_items(p_program uuid,p_account uuid,p_month date,p_items jsonb,
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
        (p_role='client' and item.creative_path is null) or btrim(item.caption)='' or item.client_decision='changes' or item.scheduled_for is null) then
      raise exception using errcode='P0001',message=case when p_role='client'
        then 'Review the current caption, publish date and frozen creative before approval.'
        else 'Add the caption and the publish date before authorizing this piece.' end;
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

-- Mark authorized pieces scheduled or live by hand, or reopen them. Only for a client
-- that is not on automated publishing, and never for a piece the bridge has touched.
create function public.social_mark_delivered(p_program uuid,p_items jsonb,p_event text,p_url text,p_actor uuid,p_name text)
returns integer language plpgsql set search_path='' as $$
declare
  program public.social_programs; item public.social_content_items; wanted record; n integer:=0;
begin
  select * into program from public.social_programs where id=p_program for share;
  if program.id is null or program.status not in ('onboarding','active') then
    raise exception using errcode='P0002',message='This client is unavailable.';
  end if;
  if not exists(select 1 from public.team_members t where t.id=p_actor and t.is_active and t.role::text in ('admin','coordinator')) then
    raise exception using errcode='P0001',message='Only office staff can record publishing.';
  end if;
  if program.publishing_enabled then
    raise exception using errcode='P0001',message='This client publishes through its connected publisher, which records each post itself.';
  end if;
  if p_event not in ('scheduled','published','reopened') or jsonb_typeof(p_items)<>'array'
     or jsonb_array_length(p_items) not between 1 and 300
     or (select count(distinct x.id) from jsonb_to_recordset(p_items) x(id uuid,revision integer))<>jsonb_array_length(p_items)
     or (coalesce(p_url,'')<>'' and (p_event<>'published' or jsonb_array_length(p_items)<>1 or p_url !~ '^https://[^[:space:]]+$' or length(p_url)>500)) then
    raise exception using errcode='P0001',message='Reload the page and choose the pieces again.';
  end if;
  for wanted in select * from jsonb_to_recordset(p_items) x(id uuid,revision integer) order by id loop
    select i.* into item from public.social_content_items i join public.social_accounts a on a.id=i.account_id
      where i.id=wanted.id and a.program_id=p_program for update of i;
    if item.id is null then raise exception using errcode='P0002',message='Piece unavailable.'; end if;
    if item.review_revision is distinct from wanted.revision then
      raise exception using errcode='P0001',message='A piece changed. Reload and try again.';
    end if;
    if exists(select 1 from public.social_deliveries d where d.item_id=item.id and d.state in ('claimed','uncertain','scheduled','published')) then
      raise exception using errcode='P0001',message='The connected publisher already handled this piece. Reconcile it there.';
    end if;
    if p_event='reopened' then
      if item.status not in ('scheduled','published') then
        raise exception using errcode='P0001',message='Only a scheduled or live piece can be reopened.';
      end if;
      perform set_config('social.manual_reopen','on',true);
      update public.social_content_items set status='approved',published_url='',updated_by=p_actor,updated_at=now() where id=item.id;
      perform set_config('social.manual_reopen','off',true);
    else
      if item.approved_revision is distinct from item.review_revision or item.client_decision='changes'
         or (p_event='scheduled' and item.status<>'approved')
         or (p_event='published' and item.status not in ('approved','scheduled')) then
        raise exception using errcode='P0001',message='Authorize the current version of each piece, and handle any change the client asked for, first.';
      end if;
      update public.social_content_items set status=p_event,
        published_url=case when p_event='published' and coalesce(p_url,'')<>'' then p_url else published_url end,
        updated_by=p_actor,updated_at=now() where id=item.id;
    end if;
    insert into public.social_review_events(item_id,revision,event,actor_name,actor_id,note,snapshot)
      values(item.id,item.review_revision,p_event,p_name,p_actor,'',
        jsonb_build_object('publish_on',item.scheduled_for,'publish_time',item.publish_time,'published_url',coalesce(nullif(p_url,''),item.published_url),'by_hand',true));
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.social_mark_delivered(uuid,jsonb,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.social_mark_delivered(uuid,jsonb,text,text,uuid,text) to service_role;
