-- Every office conversion and capacity reservation is atomic, including a retried request.
alter table public.social_onboarding_submissions
  add column program_id uuid references public.social_programs(id);
create index social_intake_program_idx on public.social_onboarding_submissions(program_id) where program_id is not null;

create function public.social_link_intake(p_intake uuid, p_program uuid, p_actor uuid)
returns uuid language plpgsql set search_path = '' as $$
declare intake public.social_onboarding_submissions; target uuid; mode text;
begin
  select * into intake from public.social_onboarding_submissions where id=p_intake for update;
  if not found then raise exception 'unknown_intake' using errcode='P0002'; end if;
  if intake.program_id is not null then
    if p_program is not null and p_program <> intake.program_id then raise exception 'already_linked'; end if;
    return intake.program_id;
  end if;
  mode := case intake.answers->>'approval'
    when 'Send me each post to approve' then 'individual'
    when 'Send me the month''s calendar to approve' then 'batch'
    when 'I trust you, post without approval' then 'office'
  end;
  if mode is null then raise exception 'unknown_approval_preference'; end if;
  if p_program is null then
    insert into public.social_programs(name,contact_name,contact_email,created_by,approval_mode)
      values(left(intake.business_name,160),left(intake.contact_name,160),intake.email,p_actor,mode)
      returning id into target;
  else
    update public.social_programs set approval_mode=mode,updated_at=now() where id=p_program returning id into target;
    if not found then raise exception 'unknown_program' using errcode='P0002'; end if;
  end if;
  update public.social_onboarding_submissions set program_id=target,status='reviewed',reviewed_by=p_actor,reviewed_at=now() where id=p_intake;
  return target;
end $$;

create function public.social_reserve_intake_file(p_intake uuid, p_file uuid, p_path text, p_name text,
  p_kind text, p_mime text, p_bytes bigint)
returns text language plpgsql set search_path = '' as $$
declare existing public.social_onboarding_files; file_count integer; reserved bigint;
begin
  -- All admissions share one short transaction, keeping both the global daily and per-intake caps exact.
  perform pg_advisory_xact_lock(872031, 1);
  select * into existing from public.social_onboarding_files where id=p_file;
  if found then
    if existing.submission_id<>p_intake or existing.declared_bytes<>p_bytes or existing.original_name<>p_name then
      raise exception 'file_changed';
    end if;
    if existing.status='uploaded' then return 'uploaded'; end if;
    if existing.storage_path<>p_path then raise exception 'file_changed'; end if;
    return 'pending';
  end if;
  if p_bytes<1 or p_bytes>2147483648 then raise exception 'file_bytes'; end if;
  select count(*),coalesce(sum(declared_bytes),0) into file_count,reserved from public.social_onboarding_files where submission_id=p_intake;
  if file_count>=40 then raise exception 'file_count'; end if;
  if reserved+p_bytes>10737418240 then raise exception 'intake_bytes'; end if;
  if (select count(*) from public.social_onboarding_files where created_at>=now()-interval '24 hours')>=400 then
    raise exception 'daily_capacity';
  end if;
  insert into public.social_onboarding_files(id,submission_id,kind,original_name,storage_path,content_type,declared_bytes)
    values(p_file,p_intake,p_kind,p_name,p_path,p_mime,p_bytes);
  return 'reserved';
end $$;

-- Update only the chosen checklist key, so unrelated edits and simultaneous signatures are preserved.
create function public.social_set_onboarding_step(p_program uuid,p_step text,p_done boolean,p_day date)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.social_programs set onboarding=case when p_done then
    jsonb_set(onboarding,array[p_step],coalesce(onboarding->p_step,to_jsonb(p_day)))
    else onboarding-p_step end,updated_at=now() where id=p_program;
  return found;
end $$;

-- A successful countersignature and its checklist step belong to the same commit.
create function public.social_mark_signed_step() returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.social_set_onboarding_step(new.program_id,'agreement_signed',true,(new.countersigned_at at time zone 'America/New_York')::date);
  return new;
end $$;
create trigger social_agreement_completed after update of status on public.social_agreements
  for each row when (new.status='signed' and old.status is distinct from new.status) execute function public.social_mark_signed_step();

revoke all on function public.social_link_intake(uuid,uuid,uuid), public.social_reserve_intake_file(uuid,uuid,text,text,text,text,bigint),
  public.social_set_onboarding_step(uuid,text,boolean,date), public.social_mark_signed_step() from public,anon,authenticated;
grant execute on function public.social_link_intake(uuid,uuid,uuid), public.social_reserve_intake_file(uuid,uuid,text,text,text,text,bigint),
  public.social_set_onboarding_step(uuid,text,boolean,date), public.social_mark_signed_step() to service_role;

-- Only Storage's API deletes bytes. Select objects past the 24-hour intake window
-- and all outstanding upload tickets; keep every confirmed download, including
-- historical uploads saved at a pre-verification path.
create function public.social_expired_intake_objects()
returns table(object_path text) language sql stable set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id='social-onboarding' and o.created_at<now()-interval '48 hours'
    and not exists (
      select 1 from public.social_onboarding_files f where f.storage_path=o.name and f.status='uploaded'
    )
  order by o.created_at,o.name limit 500
$$;
revoke all on function public.social_expired_intake_objects() from public,anon,authenticated;
grant execute on function public.social_expired_intake_objects() to service_role;
