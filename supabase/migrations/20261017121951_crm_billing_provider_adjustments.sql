-- A refund/dispute is evidence requiring office reconciliation, never new debt
-- or permission to charge again. Historical paid cents remain unchanged.
alter table public.crm_billing_invoices add column payment_review_required boolean not null default false;
alter table public.crm_billing_invoices add column payment_review_task_id uuid references public.crm_tasks(id);
create index crm_billing_payment_review_task_idx on public.crm_billing_invoices(payment_review_task_id);
alter table public.crm_billing_checkouts add column stripe_payload_version integer not null default 1;
alter table public.crm_billing_checkouts alter column stripe_payload_version set default 2;
create table public.crm_billing_stripe_payments (
 payment_intent_id text primary key check(payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
 checkout_id uuid not null references public.crm_billing_checkouts(id),session_id text not null unique check(session_id ~ '^cs_[A-Za-z0-9_]+$'),
 charge_id text not null unique check(charge_id ~ '^ch_[A-Za-z0-9_]+$'),currency text not null,amount_cents integer not null check(amount_cents>0),
 verified_at timestamptz not null,created_at timestamptz not null default now()
);
create index crm_billing_stripe_payments_checkout_idx on public.crm_billing_stripe_payments(checkout_id);
create table public.crm_billing_payment_events (
 event_id text primary key check(length(event_id) between 1 and 240),checkout_id uuid not null references public.crm_billing_checkouts(id),invoice_id uuid not null references public.crm_billing_invoices(id),
 event_type text not null check(event_type in ('charge.refunded','charge.refund.updated','refund.created','refund.updated','refund.failed','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated','checkout.session.completed','checkout.session.async_payment_succeeded')),
 payment_intent_id text not null references public.crm_billing_stripe_payments(payment_intent_id),charge_id text not null,
 evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=12000),task_id uuid references public.crm_tasks(id),created_at timestamptz not null default now()
);
create index crm_billing_payment_events_invoice_idx on public.crm_billing_payment_events(invoice_id,created_at desc);
create index crm_billing_payment_events_checkout_idx on public.crm_billing_payment_events(checkout_id);
create index crm_billing_payment_events_intent_idx on public.crm_billing_payment_events(payment_intent_id);
create index crm_billing_payment_events_task_idx on public.crm_billing_payment_events(task_id);
alter table public.crm_billing_stripe_payments enable row level security;
alter table public.crm_billing_payment_events enable row level security;
revoke all on public.crm_billing_stripe_payments,public.crm_billing_payment_events from public,anon,authenticated,service_role;
grant select,insert on public.crm_billing_stripe_payments,public.crm_billing_payment_events to service_role;

create function public.crm_billing_bind_stripe_payment(p_checkout uuid,p_evidence jsonb) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare existing public.crm_billing_stripe_payments;ck public.crm_billing_checkouts;at_time timestamptz;
begin
 at_time:=(p_evidence->>'provider_verified_at')::timestamptz;
 if not coalesce((p_evidence->>'livemode')::boolean,false) or p_evidence->>'checkout_id' is distinct from p_checkout::text or at_time is null or at_time<clock_timestamp()-interval '2 minutes' or at_time>clock_timestamp()+interval '5 seconds' then raise exception 'Fresh live Stripe association required';end if;
 select * into ck from public.crm_billing_checkouts where id=p_checkout for update;
 if not found then raise exception 'Checkout not found';end if;
 insert into public.crm_billing_stripe_payments(payment_intent_id,checkout_id,session_id,charge_id,currency,amount_cents,verified_at)
 values(p_evidence->>'payment_intent_id',p_checkout,p_evidence->>'session_id',p_evidence->>'charge_id',p_evidence->>'currency',(p_evidence->>'amount_total')::int,at_time) on conflict(payment_intent_id) do nothing;
 select * into existing from public.crm_billing_stripe_payments where payment_intent_id=p_evidence->>'payment_intent_id';
 if existing.checkout_id<>p_checkout or existing.session_id is distinct from p_evidence->>'session_id' or existing.charge_id is distinct from p_evidence->>'charge_id' or existing.currency is distinct from p_evidence->>'currency' or existing.amount_cents is distinct from (p_evidence->>'amount_total')::int then raise exception 'Stripe payment association changed';end if;
end $$;
revoke all on function public.crm_billing_bind_stripe_payment(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_billing_bind_stripe_payment(uuid,jsonb) to service_role;

create function public.crm_billing_provider_hold(p_checkout uuid,p_event text,p_type text,p_evidence jsonb) returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare ck public.crm_billing_checkouts;inv public.crm_billing_invoices;link public.crm_billing_stripe_payments;tid uuid;owner uuid;at_time timestamptz;
begin
 select * into ck from public.crm_billing_checkouts where id=p_checkout;
 if not found then raise exception 'Checkout not found';end if;
 select * into inv from public.crm_billing_invoices where id=ck.invoice_id for update;
 if exists(select 1 from public.crm_billing_payment_events where event_id=p_event and checkout_id=p_checkout) then return 'already_held';end if;
 select * into link from public.crm_billing_stripe_payments where payment_intent_id=p_evidence->>'payment_intent_id' and checkout_id=p_checkout and charge_id=p_evidence->>'charge_id' and session_id=p_evidence->>'session_id';
 at_time:=(p_evidence->>'provider_verified_at')::timestamptz;
 if not found or link.payment_intent_id is null or at_time is null or at_time<clock_timestamp()-interval '2 minutes' or at_time>clock_timestamp()+interval '5 seconds' or not coalesce((p_evidence->>'livemode')::boolean,false) then raise exception 'Verified Stripe association required';end if;
 tid:=inv.payment_review_task_id;
 if tid is null or not exists(select 1 from public.crm_tasks where id=tid and completed_at is null) then
  select o.owner_id into owner from public.crm_opportunities o join public.team_members t on t.id=o.owner_id and t.is_active and t.role::text in ('admin','coordinator') where o.project_id=inv.project_id;
  if owner is null then select id into owner from public.team_members where is_active and role::text in ('admin','coordinator') order by case when role::text='admin' then 0 else 1 end,id limit 1;end if;
  tid:=gen_random_uuid();insert into public.crm_tasks(id,client_id,project_id,title,owner_id,due_at) values(tid,inv.client_id,inv.project_id,left('URGENT: Reconcile Stripe refund/dispute — '||inv.title,180),owner,now());
 end if;
 insert into public.crm_billing_payment_events(event_id,checkout_id,invoice_id,event_type,payment_intent_id,charge_id,evidence,task_id) values(p_event,p_checkout,inv.id,p_type,link.payment_intent_id,link.charge_id,p_evidence,tid);
 update public.crm_billing_invoices set payment_review_required=true,payment_review_task_id=tid,collection_enabled=false,reconciliation='disputed',reviewed_at=null,reviewed_by=null,approved_at=null,approved_by=null,version=version+1,updated_at=now() where id=inv.id;
 insert into public.crm_events(client_id,project_id,kind,body,details) values(inv.client_id,inv.project_id,'billing_provider_adjustment','Stripe refund/dispute needs office reconciliation; collection is held',jsonb_build_object('invoice_id',inv.id,'checkout_id',p_checkout,'stripe_event_id',p_event,'event_type',p_type,'payment_intent_id',link.payment_intent_id,'charge_id',link.charge_id,'task_id',tid));
 return 'held';
end $$;
revoke all on function public.crm_billing_provider_hold(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_billing_provider_hold(uuid,text,text,jsonb) to service_role;

create function public.crm_billing_adjustment_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.payment_review_required and new.collection_enabled then raise exception 'Stripe refund/dispute reconciliation must be completed before collecting again';end if;
 return new;
end $$;
revoke all on function public.crm_billing_adjustment_guard() from public,anon,authenticated;
create trigger crm_billing_adjustment_guard before update on public.crm_billing_invoices for each row execute function public.crm_billing_adjustment_guard();

create or replace function public.crm_billing_reserve(p_token text) returns jsonb language plpgsql set search_path=public as $$
declare ins public.crm_billing_installments;inv public.crm_billing_invoices;ck public.crm_billing_checkouts;
begin
 select * into ins from public.crm_billing_installments where access_token=p_token;
 if not found then return jsonb_build_object('error','Payment link unavailable.');end if;
 select * into inv from public.crm_billing_invoices where id=ins.invoice_id for update;
 select * into ins from public.crm_billing_installments where id=ins.id for update;
 if inv.payment_review_required then return jsonb_build_object('error','This payment is being reconciled following a Stripe refund or dispute. Contact the office before paying again.');end if;
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

