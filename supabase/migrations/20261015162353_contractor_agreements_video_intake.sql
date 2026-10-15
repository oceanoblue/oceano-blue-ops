-- Additive only: no changes to photo orders, dispatch, photo intake or payouts.
create table public.contractor_agreements (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  company_legal_name text not null check (length(company_legal_name) between 2 and 200),
  contractor_legal_name text not null check (length(contractor_legal_name) between 2 and 200),
  contractor_email text not null,
  template_version text not null default '2026-10-15.1',
  body_text text not null check (length(body_text) between 100 and 50000),
  esign_consent text not null,
  document_hash text generated always as (encode(sha256(convert_to('Oceano Blue contractor agreement' || E'\n' || template_version || E'\n' || company_legal_name || E'\n' || contractor_legal_name || E'\n' || contractor_email || E'\n' || esign_consent || E'\n' || body_text, 'UTF8')), 'hex')) stored,
  status text not null default 'draft' check (status in ('draft','issued','executed','void')),
  company_signature jsonb,
  contractor_signature jsonb,
  void_reason text,
  created_by uuid not null,
  last_actor_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('issued','executed') or company_signature is not null),
  check ((status = 'executed') = (contractor_signature is not null))
);
create index contractor_agreements_owner_idx on public.contractor_agreements(contractor_id,created_at desc);

create table public.contractor_agreement_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.contractor_agreements(id) on delete restrict,
  actor_id uuid not null,
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index contractor_agreement_events_parent_idx on public.contractor_agreement_events(agreement_id,created_at);

-- No client-side SELECT policies: signing codes/hashes never leave the server.
create table public.contractor_signature_challenges (
  agreement_id uuid primary key references public.contractor_agreements(id) on delete restrict,
  actor_id uuid not null,
  code_hash text not null check (length(code_hash)=64),
  expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  attempts integer not null default 0,
  window_start timestamptz not null default now(),
  window_count integer not null default 1
);

create table public.contractor_video_intakes (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  title text not null check (length(title) between 2 and 180),
  location text not null default '',
  shoot_date date,
  due_at timestamptz,
  instructions text not null default '',
  status text not null default 'assigned' check (status in ('assigned','submitted','changes_requested','received','cancelled')),
  dropbox_path text,
  dropbox_url text,
  dropbox_request_id text,
  provision_token uuid,
  provision_until timestamptz,
  reported_file_count integer check (reported_file_count > 0),
  verified_file_count integer not null default 0 check (verified_file_count >= 0),
  verified_bytes bigint not null default 0 check (verified_bytes >= 0),
  file_manifest jsonb not null default '[]'::jsonb,
  handoff_notes text not null default '',
  audio_status text check (audio_status in ('included','not_recorded')),
  backup_confirmed boolean not null default false,
  originals_confirmed boolean not null default false,
  revision_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('submitted','received') or (verified_file_count > 0 and verified_bytes > 0 and reported_file_count=verified_file_count and backup_confirmed and originals_confirmed and audio_status is not null))
);
create index contractor_video_intakes_owner_idx on public.contractor_video_intakes(contractor_id,created_at desc);
create index contractor_video_intakes_due_idx on public.contractor_video_intakes(status,due_at);

create table public.contractor_video_intake_events (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.contractor_video_intakes(id) on delete restrict,
  actor_id uuid not null,
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index contractor_video_events_parent_idx on public.contractor_video_intake_events(intake_id,created_at);

alter table public.contractor_agreements enable row level security;
alter table public.contractor_agreement_events enable row level security;
alter table public.contractor_signature_challenges enable row level security;
alter table public.contractor_video_intakes enable row level security;
alter table public.contractor_video_intake_events enable row level security;

create policy agreement_read on public.contractor_agreements for select to authenticated using (
  contractor_id = public.current_contractor_id() or exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text='admin')
);
create policy agreement_event_read on public.contractor_agreement_events for select to authenticated using (
  exists(select 1 from public.contractor_agreements a where a.id=agreement_id)
);
create policy video_intake_read on public.contractor_video_intakes for select to authenticated using (
  contractor_id = public.current_contractor_id() or exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text='admin')
);
create policy video_intake_event_read on public.contractor_video_intake_events for select to authenticated using (
  exists(select 1 from public.contractor_video_intakes a where a.id=intake_id)
);
revoke all on public.contractor_agreements,public.contractor_agreement_events,public.contractor_signature_challenges,public.contractor_video_intakes,public.contractor_video_intake_events from anon,authenticated;
grant select on public.contractor_agreements,public.contractor_agreement_events,public.contractor_video_intakes,public.contractor_video_intake_events to authenticated;
grant all on public.contractor_agreements,public.contractor_agreement_events,public.contractor_signature_challenges,public.contractor_video_intakes,public.contractor_video_intake_events to service_role;

create function public.guard_contractor_agreement() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then raise exception 'Agreement records must be retained'; end if;
  if old.status in ('executed','void') then raise exception 'Final agreement is immutable'; end if;
  if old.status <> 'draft' and row(new.contractor_id,new.company_legal_name,new.contractor_legal_name,new.contractor_email,new.template_version,new.body_text,new.esign_consent,new.company_signature,new.created_by,new.created_at)
    is distinct from row(old.contractor_id,old.company_legal_name,old.contractor_legal_name,old.contractor_email,old.template_version,old.body_text,old.esign_consent,old.company_signature,old.created_by,old.created_at)
  then raise exception 'Issued agreement content is immutable; create a new version'; end if;
  if old.status='draft' and new.status='executed' then raise exception 'Issue before signing'; end if;
  if old.status='issued' and new.status='draft' then raise exception 'Cannot reopen an issued agreement'; end if;
  new.updated_at=now(); return new;
end $$;
revoke all on function public.guard_contractor_agreement() from public;
create trigger contractor_agreement_guard before update or delete on public.contractor_agreements for each row execute function public.guard_contractor_agreement();

create function public.retain_contractor_evidence() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin raise exception 'Audit events are append-only'; end $$;
revoke all on function public.retain_contractor_evidence() from public;
create trigger agreement_events_immutable before update or delete on public.contractor_agreement_events for each row execute function public.retain_contractor_evidence();
create trigger video_events_immutable before update or delete on public.contractor_video_intake_events for each row execute function public.retain_contractor_evidence();

create function public.audit_contractor_agreement() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare k text;
begin
  if tg_op='INSERT' then k='draft_created';
  elsif new.status is distinct from old.status then k=new.status;
  elsif new.body_text is distinct from old.body_text then k='draft_revised';
  else return new; end if;
  insert into public.contractor_agreement_events(agreement_id,actor_id,kind,details) values(new.id,new.last_actor_id,k,jsonb_build_object('document_hash',new.document_hash,'status',new.status));
  return new;
end $$;
revoke all on function public.audit_contractor_agreement() from public;
create trigger contractor_agreement_audit after insert or update on public.contractor_agreements for each row execute function public.audit_contractor_agreement();

-- Service-role RPCs re-check the bound contractor. No SECURITY DEFINER functions.
create function public.request_contractor_signature_code(p_agreement uuid,p_actor uuid,p_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.contractor_agreements; c public.contractor_signature_challenges; n timestamptz:=clock_timestamp();
begin
  select * into a from public.contractor_agreements where id=p_agreement for update;
  if not found or a.status<>'issued' then return jsonb_build_object('error','agreement_not_signable'); end if;
  if not exists(select 1 from public.contractors where id=a.contractor_id and auth_user_id=p_actor and is_active and lower(email::text)=lower(a.contractor_email)) then return jsonb_build_object('error','forbidden'); end if;
  select * into c from public.contractor_signature_challenges where agreement_id=a.id;
  if c.requested_at > n-interval '60 seconds' then return jsonb_build_object('error','wait_60_seconds'); end if;
  if c.window_start > n-interval '1 hour' and c.window_count>=5 then return jsonb_build_object('error','signing_code_hourly_limit'); end if;
  insert into public.contractor_signature_challenges(agreement_id,actor_id,code_hash,expires_at,requested_at,window_start,window_count)
    values(a.id,p_actor,p_hash,n+interval '10 minutes',n,n,1)
    on conflict(agreement_id) do update set actor_id=p_actor,code_hash=p_hash,expires_at=n+interval '10 minutes',requested_at=n,attempts=0,
      window_start=case when contractor_signature_challenges.window_start>n-interval '1 hour' then contractor_signature_challenges.window_start else n end,
      window_count=case when contractor_signature_challenges.window_start>n-interval '1 hour' then contractor_signature_challenges.window_count+1 else 1 end;
  insert into public.contractor_agreement_events(agreement_id,actor_id,kind) values(a.id,p_actor,'signing_code_requested');
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.request_contractor_signature_code(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_contractor_signature_code(uuid,uuid,text) to service_role;

create function public.complete_contractor_signature(p_agreement uuid,p_actor uuid,p_hash text,p_name text,p_document_hash text,p_browser text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.contractor_agreements; c public.contractor_signature_challenges; n timestamptz:=clock_timestamp();
begin
  select * into a from public.contractor_agreements where id=p_agreement for update;
  if not found or a.status<>'issued' then return jsonb_build_object('error','agreement_not_signable'); end if;
  if not exists(select 1 from public.contractors where id=a.contractor_id and auth_user_id=p_actor and is_active and lower(email::text)=lower(a.contractor_email)) then return jsonb_build_object('error','forbidden'); end if;
  if a.document_hash<>p_document_hash then return jsonb_build_object('error','document_changed_reload'); end if;
  if length(btrim(p_name))<2 or length(p_name)>200 then return jsonb_build_object('error','signature_name_required'); end if;
  select * into c from public.contractor_signature_challenges where agreement_id=a.id and actor_id=p_actor for update;
  if not found or c.expires_at<n or c.attempts>=5 then return jsonb_build_object('error','request_new_signing_code'); end if;
  update public.contractor_signature_challenges set attempts=attempts+1 where agreement_id=a.id;
  if c.code_hash<>p_hash then return jsonb_build_object('error','incorrect_signing_code'); end if;
  update public.contractor_agreements set status='executed',last_actor_id=p_actor,contractor_signature=jsonb_build_object(
    'name',btrim(p_name),'email',a.contractor_email,'user_id',p_actor,'at',n,'consent',a.esign_consent,'method','authenticated account + emailed one-time code + typed signature','browser',left(p_browser,500)
  ) where id=a.id;
  delete from public.contractor_signature_challenges where agreement_id=a.id;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.complete_contractor_signature(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_contractor_signature(uuid,uuid,text,text,text,text) to service_role;

comment on table public.contractor_agreements is 'Admin-reviewed master agreements. No migration seeds or sends a real agreement. Executed and void records are immutable.';
comment on table public.contractor_video_intakes is 'Separate RAW-video handoffs, never advances photo orders or creates contractor payments.';
