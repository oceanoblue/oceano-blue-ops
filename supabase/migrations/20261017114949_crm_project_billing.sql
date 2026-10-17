-- Project receivables are distinct from real-estate order/gallery invoices.
-- Source totals and credits are immutable. Import never authorizes collection.
create table public.crm_billing_invoices (
 id uuid primary key,project_id uuid not null references public.projects(id),client_id uuid not null references public.clients(id),
 title text not null check(length(trim(title)) between 1 and 180),currency text not null default 'usd' check(currency='usd'),
 total_cents integer not null check(total_cents between 0 and 2000000000),source_paid_cents integer not null check(source_paid_cents>=0 and source_paid_cents<=total_cents),
 source_system text not null check(source_system in ('honeybook','ops')),source_id text not null check(length(source_id) between 1 and 240),source_url text not null default '' check(length(source_url)<=2000 and (source_url='' or source_url ~ '^https://[^/@]+(/|$)')),
 evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=60000),evidence_checked_at timestamptz not null,
 reconciliation text not null default 'pending' check(reconciliation in ('pending','verified','disputed')),
 source_collection_stopped boolean not null default false,collection_enabled boolean not null default false,
 reviewed_at timestamptz,reviewed_by uuid references public.team_members(id),approved_at timestamptz,approved_by uuid references public.team_members(id),
 review_note text not null default '' check(length(review_note)<=4000),version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(source_system,source_id)
);
create index crm_billing_invoices_project_idx on public.crm_billing_invoices(project_id);
create index crm_billing_invoices_client_idx on public.crm_billing_invoices(client_id);
create table public.crm_billing_installments (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.crm_billing_invoices(id),
 title text not null check(length(trim(title)) between 1 and 180),amount_cents integer not null check(amount_cents between 1 and 2000000000),
 paid_cents integer not null default 0 check(paid_cents between 0 and amount_cents),due_date date,due_date_verified boolean not null default false,
 access_token text not null unique default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 version integer not null default 1,created_at timestamptz not null default now(),check(not due_date_verified or due_date is not null)
);
create index crm_billing_installments_invoice_idx on public.crm_billing_installments(invoice_id);
create index crm_billing_installments_due_idx on public.crm_billing_installments(due_date) where paid_cents<amount_cents;
create table public.crm_billing_checkouts (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.crm_billing_invoices(id),installment_id uuid not null references public.crm_billing_installments(id),
 invoice_version integer not null,installment_version integer not null,expected_cents integer not null check(expected_cents>0),
 stripe_session_id text unique,status text not null default 'reserved' check(status in ('reserved','open','settled','expired','review')),
 expires_at timestamptz not null default now()+interval '60 minutes',created_at timestamptz not null default now(),settled_at timestamptz,event_id text,received_cents integer,review_reason text
);
create unique index crm_billing_one_checkout_idx on public.crm_billing_checkouts(installment_id) where status in ('reserved','open');
create index crm_billing_checkouts_invoice_idx on public.crm_billing_checkouts(invoice_id);

create table public.crm_billing_receipts (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.crm_billing_invoices(id),installment_id uuid not null references public.crm_billing_installments(id),
 amount_cents integer not null check(amount_cents>0),source_system text not null check(source_system in ('honeybook','bank','other')),source_id text not null check(length(trim(source_id)) between 1 and 240),
 evidence text not null check(length(trim(evidence)) between 1 and 4000),paid_at timestamptz not null,recorded_by uuid not null references public.team_members(id),created_at timestamptz not null default now(),unique(source_system,source_id)
);
create index crm_billing_receipts_invoice_idx on public.crm_billing_receipts(invoice_id);
alter table public.crm_billing_receipts enable row level security;
revoke all on public.crm_billing_receipts from public,anon,authenticated,service_role;
grant select,insert on public.crm_billing_receipts to service_role;

-- No public Data API access, including for signed-in clients. Office APIs check
-- the active team role before service-role reads and invoke guarded mutations.
alter table public.crm_billing_invoices enable row level security;
alter table public.crm_billing_installments enable row level security;
alter table public.crm_billing_checkouts enable row level security;
revoke all on public.crm_billing_invoices,public.crm_billing_installments,public.crm_billing_checkouts from public,anon,authenticated,service_role;
grant select,insert,update on public.crm_billing_invoices,public.crm_billing_installments,public.crm_billing_checkouts to service_role;

create function public.crm_billing_immutable() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.project_id,new.client_id,new.title,new.currency,new.total_cents,new.source_paid_cents,new.source_system,new.source_id,new.source_url,new.evidence,new.evidence_checked_at)
 is distinct from row(old.project_id,old.client_id,old.title,old.currency,old.total_cents,old.source_paid_cents,old.source_system,old.source_id,old.source_url,old.evidence,old.evidence_checked_at) then raise exception 'Source evidence is immutable';end if;
 return new;
end $$;
create trigger crm_billing_immutable before update on public.crm_billing_invoices for each row execute function public.crm_billing_immutable();
revoke all on function public.crm_billing_immutable() from public,anon,authenticated;

create function public.crm_billing_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql set search_path=public as $$
declare inv public.crm_billing_invoices; opp public.crm_opportunities; ins public.crm_billing_installments; line jsonb; total bigint; cnt integer; active boolean; new_version integer;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role in ('admin','coordinator')) then raise exception 'Office access required';end if;
 if p_action='invoice_create' then
  select * into opp from public.crm_opportunities where project_id=(p_data->>'project_id')::uuid;
  if not found then return jsonb_build_object('error','Choose an existing CRM project.');end if;
  if exists(select 1 from public.crm_billing_invoices where source_system=p_data->>'source_system' and source_id=p_data->>'source_id') then return jsonb_build_object('error','This source invoice is already imported.');end if;
  if jsonb_typeof(p_data->'installments')<>'array' or jsonb_array_length(p_data->'installments')>36 then return jsonb_build_object('error','Provide at most 36 remaining installments.');end if;
  select coalesce(sum((x->>'amount_cents')::bigint),0),count(*) into total,cnt from jsonb_array_elements(p_data->'installments')x;
  if total<>(p_data->>'total_cents')::bigint-(p_data->>'source_paid_cents')::bigint then return jsonb_build_object('error','Remaining installments must match the unpaid source balance.');end if;
  insert into public.crm_billing_invoices(id,project_id,client_id,title,total_cents,source_paid_cents,source_system,source_id,source_url,evidence,evidence_checked_at)
  values(p_id,opp.project_id,opp.client_id,p_data->>'title',(p_data->>'total_cents')::int,(p_data->>'source_paid_cents')::int,p_data->>'source_system',p_data->>'source_id',coalesce(p_data->>'source_url',''),p_data->'evidence',(p_data->>'evidence_checked_at')::timestamptz) returning * into inv;
  for line in select value from jsonb_array_elements(p_data->'installments') loop
   insert into public.crm_billing_installments(invoice_id,title,amount_cents,due_date,due_date_verified) values(p_id,line->>'title',(line->>'amount_cents')::int,nullif(line->>'due_date','')::date,coalesce((line->>'due_date_verified')::boolean,false));
  end loop;
  if nullif(p_data->>'follow_up_at','') is not null and exists(select 1 from public.crm_stages where id=opp.stage_id and outcome in ('open','won')) then
   insert into public.crm_tasks(client_id,project_id,title,owner_id,due_at) values(opp.client_id,opp.project_id,left('Review payment migration: '||inv.title,180),coalesce(opp.owner_id,p_actor),(p_data->>'follow_up_at')::timestamptz);
  end if;
  new_version:=1;
 else
  if p_action in ('installment_date','record_payment') then select * into ins from public.crm_billing_installments where id=p_id;select * into inv from public.crm_billing_invoices where id=ins.invoice_id for update;
  else select * into inv from public.crm_billing_invoices where id=p_id for update;end if;
  if inv.id is null then return jsonb_build_object('error','Invoice not found.');end if;
  if p_action in ('installment_date','record_payment') then
   select * into ins from public.crm_billing_installments where id=p_id for update;
   if ins.version is distinct from p_version then return jsonb_build_object('error','Record changed. Reload and retry.');end if;
  elsif inv.version is distinct from p_version then return jsonb_build_object('error','Record changed. Reload and retry.');end if;
  select exists(select 1 from public.crm_billing_checkouts where invoice_id=inv.id and status in ('reserved','open')) into active;
  if p_action in ('review','installment_date','record_payment') and active then return jsonb_build_object('error','An active checkout must expire before changing this invoice.');end if;
  if p_action='review' then
   if p_data->>'reconciliation' not in ('pending','verified','disputed') then raise exception 'Invalid reconciliation';end if;
   update public.crm_billing_invoices set reconciliation=p_data->>'reconciliation',source_collection_stopped=coalesce((p_data->>'source_collection_stopped')::boolean,false),review_note=coalesce(p_data->>'note',''),reviewed_at=now(),reviewed_by=p_actor,collection_enabled=false,approved_at=null,approved_by=null,version=version+1,updated_at=now() where id=inv.id returning version into new_version;
  elsif p_action='activate' then
   if inv.reconciliation<>'verified' or not inv.source_collection_stopped or inv.reviewed_at is null then return jsonb_build_object('error','Verify the balance and stop source collections before activating.');end if;
   if not coalesce((p_data->>'confirm')::boolean,false) then return jsonb_build_object('error','Confirm collection approval.');end if;
   if exists(select 1 from public.crm_billing_installments where invoice_id=inv.id and paid_cents<amount_cents and (due_date is null or not due_date_verified)) then return jsonb_build_object('error','Verify every remaining installment due date before activating.');end if;
   if exists(select 1 from public.crm_billing_checkouts where invoice_id=inv.id and status='review') then return jsonb_build_object('error','A payment needs review.');end if;
   if not exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id join public.clients c on c.id=o.client_id where o.project_id=inv.project_id and s.outcome in ('open','won') and not c.is_archived) then return jsonb_build_object('error','Reopen the CRM project before collecting.');end if;
   update public.crm_billing_invoices set collection_enabled=true,approved_at=now(),approved_by=p_actor,version=version+1,updated_at=now() where id=inv.id returning version into new_version;
  elsif p_action='hold' then
   update public.crm_billing_invoices set collection_enabled=false,version=version+1,updated_at=now() where id=inv.id returning version into new_version;
  elsif p_action='record_payment' then
   if inv.collection_enabled then return jsonb_build_object('error','Hold collection before recording another payment.');end if;
   if exists(select 1 from public.crm_billing_checkouts where invoice_id=inv.id and status='review') then return jsonb_build_object('error','Reconcile the Stripe payment review before recording another payment.');end if;
   if not coalesce((p_data->>'confirm_not_in_source_credit')::boolean,false) then return jsonb_build_object('error','Confirm this payment is not included in the original paid credit.');end if;
   if (p_data->>'paid_at')::timestamptz>now()+interval '1 day' then return jsonb_build_object('error','Use the actual date payment was received.');end if;
   if (p_data->>'amount_cents')::bigint<1 or (p_data->>'amount_cents')::bigint>ins.amount_cents-ins.paid_cents then return jsonb_build_object('error','Payment must not exceed the remaining installment balance.');end if;
   if exists(select 1 from public.crm_billing_receipts where source_system=p_data->>'source_system' and source_id=p_data->>'source_id') then return jsonb_build_object('error','This receipt is already recorded.');end if;
   insert into public.crm_billing_receipts(invoice_id,installment_id,amount_cents,source_system,source_id,evidence,paid_at,recorded_by) values(inv.id,ins.id,(p_data->>'amount_cents')::int,p_data->>'source_system',p_data->>'source_id',p_data->>'evidence',(p_data->>'paid_at')::timestamptz,p_actor);
   update public.crm_billing_installments set paid_cents=paid_cents+(p_data->>'amount_cents')::int,version=version+1 where id=ins.id returning version into new_version;
   update public.crm_billing_invoices set reconciliation='pending',source_collection_stopped=false,reviewed_at=null,approved_at=null,approved_by=null,version=version+1,updated_at=now() where id=inv.id;
  elsif p_action='installment_date' then
   if inv.collection_enabled then return jsonb_build_object('error','Hold collection before changing a due date.');end if;
   update public.crm_billing_installments set due_date=nullif(p_data->>'due_date','')::date,due_date_verified=coalesce((p_data->>'due_date_verified')::boolean,false),version=version+1 where id=p_id returning version into new_version;
  else return jsonb_build_object('error','Unknown billing action.');end if;
 end if;
 insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(inv.client_id,inv.project_id,p_actor,'billing_'||p_action,replace(p_action,'_',' '),jsonb_build_object('invoice_id',inv.id,'record_id',p_id,'version',new_version));
 return jsonb_build_object('id',p_id,'version',new_version);
end $$;
revoke all on function public.crm_billing_action(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_billing_action(uuid,text,uuid,integer,jsonb) to service_role;

create function public.crm_billing_reserve(p_token text) returns jsonb language plpgsql set search_path=public as $$
declare ins public.crm_billing_installments;inv public.crm_billing_invoices;ck public.crm_billing_checkouts;
begin
 select * into ins from public.crm_billing_installments where access_token=p_token;
 if not found then return jsonb_build_object('error','Payment link unavailable.');end if;
 select * into inv from public.crm_billing_invoices where id=ins.invoice_id for update;
 select * into ins from public.crm_billing_installments where id=ins.id for update;
 if ins.paid_cents>=ins.amount_cents then return jsonb_build_object('paid',true);end if;
 if not inv.collection_enabled or inv.reconciliation<>'verified' or not inv.source_collection_stopped or not ins.due_date_verified or ins.due_date is null or not exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id join public.clients c on c.id=o.client_id where o.project_id=inv.project_id and s.outcome in ('open','won') and not c.is_archived) then return jsonb_build_object('error','The office is reviewing this payment.');end if;
 if exists(select 1 from public.crm_billing_checkouts where invoice_id=inv.id and status='review') then return jsonb_build_object('error','A prior payment needs office review.');end if;
 select * into ck from public.crm_billing_checkouts where installment_id=ins.id and status in ('reserved','open');
 if not found then
  insert into public.crm_billing_checkouts(invoice_id,installment_id,invoice_version,installment_version,expected_cents) values(inv.id,ins.id,inv.version,ins.version,ins.amount_cents-ins.paid_cents) returning * into ck;
 end if;
 return jsonb_build_object('checkout',to_jsonb(ck),'title',inv.title||' — '||ins.title,'currency',inv.currency);
end $$;
revoke all on function public.crm_billing_reserve(text) from public,anon,authenticated;
grant execute on function public.crm_billing_reserve(text) to service_role;

create function public.crm_billing_bind(p_id uuid,p_session text) returns void language plpgsql set search_path=public as $$
begin
 update public.crm_billing_checkouts set stripe_session_id=p_session,status=case when status='reserved' then 'open' else status end where id=p_id and (stripe_session_id is null or stripe_session_id=p_session);
 if not found then raise exception 'Checkout changed';end if;
end $$;
revoke all on function public.crm_billing_bind(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_billing_bind(uuid,text) to service_role;

-- Only the server invokes this after Stripe confirms the exact session expired.
create function public.crm_billing_expire(p_id uuid,p_session text) returns void language plpgsql set search_path=public as $$
begin update public.crm_billing_checkouts set status='expired' where id=p_id and stripe_session_id=p_session and status='open';end $$;
revoke all on function public.crm_billing_expire(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_billing_expire(uuid,text) to service_role;

create function public.crm_billing_settle(p_id uuid,p_session text,p_event text,p_amount integer,p_currency text) returns text language plpgsql set search_path=public as $$
declare ck public.crm_billing_checkouts;inv public.crm_billing_invoices;ins public.crm_billing_installments;reason text;
begin
 select * into ck from public.crm_billing_checkouts where id=p_id;
 if not found then raise exception 'Checkout not found';end if;
 select * into inv from public.crm_billing_invoices where id=ck.invoice_id for update;
 select * into ins from public.crm_billing_installments where id=ck.installment_id for update;
 select * into ck from public.crm_billing_checkouts where id=p_id for update;
 if ck.status='settled' and ck.stripe_session_id=p_session then return 'already_settled';end if;
 if ck.status='review' and ck.stripe_session_id=p_session then return 'review';end if;
 if ck.stripe_session_id is not null and ck.stripe_session_id<>p_session then reason:='session_mismatch';
 elsif p_amount<>ck.expected_cents or p_currency<>inv.currency then reason:='amount_or_currency_mismatch';
 elsif ck.status not in ('reserved','open') or ck.invoice_version<>inv.version or ck.installment_version<>ins.version or ins.amount_cents-ins.paid_cents<>ck.expected_cents then reason:='invoice_changed_or_already_paid';
 end if;
 if reason is not null then
  update public.crm_billing_checkouts set status='review',stripe_session_id=coalesce(stripe_session_id,p_session),received_cents=p_amount,event_id=p_event,review_reason=reason,settled_at=now() where id=p_id;
  update public.crm_billing_invoices set collection_enabled=false,version=version+1,updated_at=now() where id=inv.id;
  insert into public.crm_events(client_id,project_id,kind,body,details) values(inv.client_id,inv.project_id,'billing_payment_review','Payment needs office reconciliation',jsonb_build_object('checkout_id',p_id,'amount_cents',p_amount,'reason',reason));
  return 'review';
 end if;
 update public.crm_billing_installments set paid_cents=paid_cents+p_amount,version=version+1 where id=ins.id;
 update public.crm_billing_checkouts set status='settled',stripe_session_id=p_session,event_id=p_event,received_cents=p_amount,settled_at=now() where id=p_id;
 insert into public.crm_events(client_id,project_id,kind,body,details) values(inv.client_id,inv.project_id,'billing_payment_received','Project installment paid',jsonb_build_object('invoice_id',inv.id,'checkout_id',p_id,'amount_cents',p_amount,'session_id',p_session));
 return 'settled';
end $$;
revoke all on function public.crm_billing_settle(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.crm_billing_settle(uuid,text,text,integer,text) to service_role;
