-- Explicit office reconciliation of paid Stripe sessions that failed the
-- automatic amount/version/session check. Never initiate a refund or charge.
alter table public.crm_billing_checkouts drop constraint crm_billing_checkouts_status_check;
alter table public.crm_billing_checkouts add constraint crm_billing_checkouts_status_check check(status in ('reserved','open','settled','expired','review','resolved'));
alter table public.crm_billing_checkouts
 add column received_currency text,
 add column review_session_id text,
 add column resolution text check(resolution in ('credit','refund_verified')),
 add column resolution_credit_cents integer not null default 0 check(resolution_credit_cents>=0),
 add column resolution_note text check(length(resolution_note)<=4000),
 add column resolution_evidence jsonb check(jsonb_typeof(resolution_evidence)='object' and octet_length(resolution_evidence::text)<=12000),
 add column resolved_at timestamptz,
 add column resolved_by uuid references public.team_members(id);

create or replace function public.crm_billing_settle(p_id uuid,p_session text,p_event text,p_amount integer,p_currency text) returns text language plpgsql set search_path=public as $$
declare ck public.crm_billing_checkouts;inv public.crm_billing_invoices;ins public.crm_billing_installments;reason text;
begin
 select * into ck from public.crm_billing_checkouts where id=p_id;
 if not found then raise exception 'Checkout not found';end if;
 select * into inv from public.crm_billing_invoices where id=ck.invoice_id for update;
 select * into ins from public.crm_billing_installments where id=ck.installment_id for update;
 select * into ck from public.crm_billing_checkouts where id=p_id for update;
 if ck.status='resolved' and p_session in (ck.stripe_session_id,ck.review_session_id) then return 'already_resolved';end if;
 if ck.status='settled' and ck.stripe_session_id=p_session then return 'already_settled';end if;
 if ck.status='review' and p_session in (ck.stripe_session_id,ck.review_session_id) then return 'review';end if;
 if ck.stripe_session_id is not null and ck.stripe_session_id<>p_session then reason:='session_mismatch';
 elsif p_amount<>ck.expected_cents or p_currency<>inv.currency then reason:='amount_or_currency_mismatch';
 elsif ck.status not in ('reserved','open') or ck.invoice_version<>inv.version or ck.installment_version<>ins.version or ins.amount_cents-ins.paid_cents<>ck.expected_cents then reason:='invoice_changed_or_already_paid';
 end if;
 if reason is not null then
  update public.crm_billing_checkouts set status='review',review_session_id=p_session,stripe_session_id=coalesce(stripe_session_id,p_session),received_cents=p_amount,received_currency=p_currency,event_id=p_event,review_reason=reason,settled_at=now() where id=p_id;
  update public.crm_billing_invoices set collection_enabled=false,version=version+1,updated_at=now() where id=inv.id;
  insert into public.crm_events(client_id,project_id,kind,body,details) values(inv.client_id,inv.project_id,'billing_payment_review','Payment needs office reconciliation',jsonb_build_object('checkout_id',p_id,'amount_cents',p_amount,'reason',reason));
  return 'review';
 end if;
 update public.crm_billing_installments set paid_cents=paid_cents+p_amount,version=version+1 where id=ins.id;
 update public.crm_billing_checkouts set status='settled',stripe_session_id=p_session,event_id=p_event,received_cents=p_amount,received_currency=p_currency,settled_at=now() where id=p_id;
 insert into public.crm_events(client_id,project_id,kind,body,details) values(inv.client_id,inv.project_id,'billing_payment_received','Project installment paid',jsonb_build_object('invoice_id',inv.id,'checkout_id',p_id,'amount_cents',p_amount,'session_id',p_session));
 return 'settled';
end $$;
revoke all on function public.crm_billing_settle(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.crm_billing_settle(uuid,text,text,integer,text) to service_role;

create function public.crm_billing_resolve_review(p_actor uuid,p_id uuid,p_invoice_version integer,p_resolution text,p_note text,p_evidence jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare ck public.crm_billing_checkouts;inv public.crm_billing_invoices;ins public.crm_billing_installments;total integer;refunded integer;net integer;ver integer;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then raise exception 'Office access required';end if;
 select * into ck from public.crm_billing_checkouts where id=p_id;
 if not found then return jsonb_build_object('error','Payment review not found.');end if;
 select * into inv from public.crm_billing_invoices where id=ck.invoice_id for update;
 select * into ins from public.crm_billing_installments where id=ck.installment_id for update;
 select * into ck from public.crm_billing_checkouts where id=p_id for update;
 if ck.status='resolved' then return jsonb_build_object('error','This payment review was already resolved. Reload the ledger.');end if;
 if ck.status<>'review' or inv.version is distinct from p_invoice_version then return jsonb_build_object('error','Record changed. Reload and retry.');end if;
 if inv.collection_enabled or exists(select 1 from public.crm_billing_checkouts where invoice_id=inv.id and status in ('reserved','open')) then return jsonb_build_object('error','Hold collection and reconcile existing checkouts before resolving this payment.');end if;
 if p_resolution not in ('credit','refund_verified') or length(trim(coalesce(p_note,''))) not between 8 and 4000 then return jsonb_build_object('error','Add a clear office reconciliation note.');end if;
 if (p_evidence->>'provider_verified_at')::timestamptz is null or (p_evidence->>'provider_verified_at')::timestamptz<clock_timestamp()-interval '2 minutes' or (p_evidence->>'provider_verified_at')::timestamptz>clock_timestamp()+interval '5 seconds' then return jsonb_build_object('error','Stripe verification expired. Inspect the payment again.');end if;
 if p_evidence->>'session_id' is distinct from coalesce(ck.review_session_id,ck.stripe_session_id) or p_evidence->>'checkout_id' is distinct from ck.id::text or p_evidence->>'mode' is distinct from 'payment' or p_evidence->>'payment_status' is distinct from 'paid' or p_evidence->>'intent_status' is distinct from 'succeeded' or p_evidence->>'charge_status' is distinct from 'succeeded' or not coalesce((p_evidence->>'charge_paid')::boolean,false) or not coalesce((p_evidence->>'charge_captured')::boolean,false) or coalesce((p_evidence->>'charge_disputed')::boolean,true) or not coalesce((p_evidence->>'refunds_verified')::boolean,false) or not coalesce((p_evidence->>'livemode')::boolean,false) or length(coalesce(p_evidence->>'charge_id',''))=0 or length(coalesce(p_evidence->>'payment_intent_id',''))=0 then return jsonb_build_object('error','The exact live Stripe payment could not be verified.');end if;
 total:=(p_evidence->>'amount_total')::integer;refunded:=(p_evidence->>'amount_refunded')::integer;
 if total is null or refunded is null or total<1 or refunded<0 or refunded>total or total is distinct from ck.received_cents then return jsonb_build_object('error','The source receipt amount does not match Stripe. Keep this payment held.');end if;
 net:=total-refunded;
 if p_resolution='credit' then
  if p_evidence->>'currency' is distinct from inv.currency or net<1 or net<>ins.amount_cents-ins.paid_cents then return jsonb_build_object('error','Only the exact remaining balance in the invoice currency can be credited. Verify any refund or prior receipt first.');end if;
  update public.crm_billing_installments set paid_cents=paid_cents+net,version=version+1 where id=ins.id;
 elsif refunded<>total then return jsonb_build_object('error','Stripe must confirm a full refund before this review can be closed without credit.');
 end if;
 update public.crm_billing_checkouts set status='resolved',resolution=p_resolution,resolution_credit_cents=case when p_resolution='credit' then net else 0 end,resolution_note=trim(p_note),resolution_evidence=p_evidence,resolved_at=now(),resolved_by=p_actor where id=p_id;
 update public.crm_billing_invoices set collection_enabled=false,reconciliation='pending',source_collection_stopped=false,reviewed_at=null,reviewed_by=null,approved_at=null,approved_by=null,version=version+1,updated_at=now() where id=inv.id returning version into ver;
 insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(inv.client_id,inv.project_id,p_actor,'billing_review_resolved',case when p_resolution='credit' then 'Verified Stripe payment credited to the exact remaining installment' else 'Full Stripe refund verified; no invoice credit applied' end,jsonb_build_object('invoice_id',inv.id,'checkout_id',ck.id,'resolution',p_resolution,'credit_cents',case when p_resolution='credit' then net else 0 end,'evidence',p_evidence,'office_note',trim(p_note)));
 return jsonb_build_object('id',ck.id,'invoice_id',inv.id,'version',ver,'resolution',p_resolution);
end $$;
revoke all on function public.crm_billing_resolve_review(uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_billing_resolve_review(uuid,uuid,integer,text,text,jsonb) to service_role;

create function public.crm_billing_resolution_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.status='resolved' and row(new.status,new.resolution,new.resolution_credit_cents,new.resolution_note,new.resolution_evidence,new.resolved_at,new.resolved_by,new.stripe_session_id,new.received_cents,new.received_currency,new.review_session_id) is distinct from row(old.status,old.resolution,old.resolution_credit_cents,old.resolution_note,old.resolution_evidence,old.resolved_at,old.resolved_by,old.stripe_session_id,old.received_cents,old.received_currency,old.review_session_id) then raise exception 'Payment reconciliation evidence is immutable';end if;
 return new;
end $$;
revoke all on function public.crm_billing_resolution_immutable() from public,anon,authenticated;
create trigger crm_billing_resolution_immutable before update on public.crm_billing_checkouts for each row execute function public.crm_billing_resolution_immutable();
