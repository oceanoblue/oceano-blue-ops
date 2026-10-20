-- New client acceptances use the issued snapshot. Old files remain unchanged.
create table public.crm_file_acceptances (
 file_id uuid primary key references public.crm_issued_files(id),
 project_id uuid not null unique references public.projects(id),
 invoice_id uuid not null unique references public.crm_billing_invoices(id),
 package_id uuid not null, addon_ids jsonb not null,
 signer_name text not null, signer_email text not null,
 agreement text not null, consent_text text not null, answers jsonb not null,
 document_hash text not null check(document_hash ~ '^[a-f0-9]{64}$'), payload_hash text not null,
 ip_hash text not null, user_agent text not null,
 total_cents integer not null, deposit_cents integer not null,
 accepted_at timestamptz not null default now()
);
create table public.crm_file_bookings (
 file_id uuid primary key references public.crm_file_acceptances(file_id),
 appointment_id uuid not null unique references public.crm_appointments(id)
);
alter table public.crm_file_acceptances enable row level security;
alter table public.crm_file_bookings enable row level security;
revoke all on public.crm_file_acceptances,public.crm_file_bookings from public,anon,authenticated,service_role;
grant select,insert on public.crm_file_acceptances,public.crm_file_bookings to service_role;
create function public.crm_file_acceptance_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin raise exception 'Signed selections and their appointment associations are immutable.';end $$;
create trigger crm_file_acceptance_immutable before update or delete on public.crm_file_acceptances for each row execute function public.crm_file_acceptance_immutable();
create trigger crm_file_booking_immutable before update or delete on public.crm_file_bookings for each row execute function public.crm_file_acceptance_immutable();
revoke all on function public.crm_file_acceptance_immutable() from public,anon,authenticated;

create function public.crm_file_accept(p_token text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public.crm_issued_files; a public.crm_file_acceptances; cfg jsonb; pkg jsonb; extra text; subtotal bigint; tax bigint; total bigint; deposit bigint; inv uuid:=gen_random_uuid(); dt date:=(now() at time zone 'America/New_York')::date; expected_email text;
begin
 select * into f from public.crm_issued_files where access_token=p_token and revoked_at is null and expires_at>now() for update;
 if not found then return jsonb_build_object('error','File unavailable.');end if;
 perform pg_advisory_xact_lock(hashtextextended(f.project_id::text,879));
 if not exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id join public.clients c on c.id=o.client_id where o.project_id=f.project_id and o.client_id=f.client_id and s.outcome in ('open','won') and not c.is_archived) then return jsonb_build_object('error','This project is no longer accepting bookings.');end if;
 select * into a from public.crm_file_acceptances where file_id=f.id;
 if found then
  if a.payload_hash is distinct from p_data->>'payload_hash' then return jsonb_build_object('error','This file has already been signed. Contact the office for changes.');end if;
  return jsonb_build_object('ok',true);
 end if;
 if exists(select 1 from public.crm_file_acceptances where project_id=f.project_id) then return jsonb_build_object('error','This project already has a signed booking. Contact the office before creating another.');end if;
 if exists(select 1 from public.crm_billing_invoices where project_id=f.project_id) then return jsonb_build_object('error','This project already has an invoice. Contact the office to review the existing payment plan.');end if;
 select value into cfg from jsonb_array_elements(f.snapshot->'blocks') where value->>'kind'='experience';
 if cfg is null or length(trim(coalesce(cfg->>'terms','')))=0 then return jsonb_build_object('error','The office must finish the agreement before you can sign.');end if;
 select email into expected_email from public.clients where id=f.client_id;
 if lower(trim(coalesce(expected_email,'')))<>lower(trim(coalesce(p_data->>'signer_email',''))) or length(trim(coalesce(p_data->>'signer_name','')))<2 or (p_data->>'consent')::boolean is distinct from true then return jsonb_build_object('error','Use the email address this file was sent to and confirm your signature.');end if;
 select value into pkg from jsonb_array_elements(cfg->'packages') where value->>'id'=p_data->>'package_id';
 if pkg is null or jsonb_typeof(p_data->'addon_ids') is distinct from 'array' then return jsonb_build_object('error','Choose a valid package.');end if;
 if (select count(*) from jsonb_array_elements_text(p_data->'addon_ids'))<>(select count(distinct value) from jsonb_array_elements_text(p_data->'addon_ids')) then return jsonb_build_object('error','Choose each extra once.');end if;
 subtotal:=(pkg->>'price_cents')::bigint;
 for extra in select value from jsonb_array_elements_text(p_data->'addon_ids') loop
  select value into pkg from jsonb_array_elements(coalesce(cfg->'addons','[]')) where value->>'id'=extra;
  if pkg is null then return jsonb_build_object('error','Choose valid extras.');end if;
  subtotal:=subtotal+(pkg->>'price_cents')::bigint;
 end loop;
 tax:=round(subtotal*coalesce((cfg->>'tax_bps')::numeric,0)/10000);total:=subtotal+tax;
 deposit:=greatest(1,ceil(total*(cfg->>'deposit_percent')::numeric/100));
 if total not between 1 and 2000000000 or deposit not between 1 and total then return jsonb_build_object('error','The office must review these prices.');end if;
 if coalesce(cfg->>'session_slug','')<>'' and not exists(select 1 from public.crm_session_types where slug=cfg->>'session_slug' and published) then return jsonb_build_object('error','The office must publish the session calendar before you can book.');end if;
 insert into public.crm_billing_invoices(id,project_id,client_id,title,total_cents,source_paid_cents,source_system,source_id,evidence,evidence_checked_at,reconciliation,source_collection_stopped,collection_enabled,review_note)
 values(inv,f.project_id,f.client_id,f.title,total,0,'ops','smart-file:'||f.id,jsonb_build_object('file_id',f.id,'package_id',p_data->>'package_id','addon_ids',p_data->'addon_ids','document_hash',p_data->>'document_hash','subtotal_cents',subtotal,'tax_cents',tax),now(),'verified',true,coalesce(cfg->>'session_slug','')='','Native client selection from an office-issued smart file.');
 insert into public.crm_billing_installments(invoice_id,title,amount_cents,due_date,due_date_verified) values(inv,case when deposit=total then 'Full payment' else 'Booking deposit' end,deposit,dt,true);
 if total>deposit then insert into public.crm_billing_installments(invoice_id,title,amount_cents,due_date,due_date_verified) values(inv,'Remaining balance',total-deposit,dt+(cfg->>'balance_days')::int,true);end if;
 insert into public.crm_file_acceptances(file_id,project_id,invoice_id,package_id,addon_ids,signer_name,signer_email,agreement,consent_text,answers,document_hash,payload_hash,ip_hash,user_agent,total_cents,deposit_cents)
 values(f.id,f.project_id,inv,(p_data->>'package_id')::uuid,p_data->'addon_ids',trim(p_data->>'signer_name'),lower(trim(p_data->>'signer_email')),p_data->>'agreement',p_data->>'consent_text',p_data->'answers',p_data->>'document_hash',p_data->>'payload_hash',p_data->>'ip_hash',left(p_data->>'user_agent',500),total,deposit);
 update public.crm_issued_files set responded_at=coalesce(responded_at,now()) where id=f.id;
 update public.crm_acquisition_jobs set status='cancelled',last_error='Client accepted the smart file.' where project_id=f.project_id and sequence_id is not null and status in ('queued','needs_approval','leased');
 insert into public.crm_events(client_id,project_id,kind,body,details) values(f.client_id,f.project_id,'smart_file_signed','Client selected services and signed the agreement',jsonb_build_object('file_id',f.id,'invoice_id',inv,'total_cents',total,'document_hash',p_data->>'document_hash'));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.crm_file_accept(text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_file_accept(text,jsonb) to service_role;

-- Extend the current conflict-safe scheduler without replacing its calendar,
-- travel-buffer, DST or notification logic. Assert anchors to fail closed.
do $migration$
declare definition text; original text; old_segment text; new_segment text;
begin
 select pg_get_functiondef('public.crm_session_commit(uuid,text,text,jsonb,integer,timestamp with time zone)'::regprocedure) into definition;
 original:=definition;
 definition:=replace(definition,'begin'||chr(10)||' perform pg_advisory_xact_lock(hashtextextended(p_id::text,733));', $patch$begin
 if p_data ? 'smart_file_token' then
  perform 1 from public.crm_issued_files f where f.access_token=p_data->>'smart_file_token' and f.revoked_at is null and f.expires_at>now() for update;
  if not found then raise exception 'File unavailable.';end if;
  if not exists(select 1 from public.crm_issued_files f join public.crm_file_acceptances accepted on accepted.file_id=f.id join public.crm_opportunities o on o.project_id=f.project_id join public.crm_stages s on s.id=o.stage_id join public.clients c on c.id=f.client_id where f.access_token=p_data->>'smart_file_token' and s.outcome in ('open','won') and not c.is_archived and exists(select 1 from jsonb_array_elements(f.snapshot->'blocks') b where b->>'kind'='experience' and b->>'session_slug'=p_slug)) then raise exception 'Sign the file before scheduling this session.';end if;
  if exists(select 1 from public.crm_file_bookings b join public.crm_issued_files f on f.id=b.file_id where f.access_token=p_data->>'smart_file_token' and b.appointment_id<>p_id) then raise exception 'A session is already reserved. Use Manage session to change it.';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,733));$patch$);
 if original=definition then raise exception 'Smart file scheduler entry anchor changed';end if;
 old_segment:=substring(definition from ' perform pg_advisory_xact_lock\(hashtextextended\(lower\(trim\(p_data->>''email''\)\),721\)\);[\s\S]*?(?= insert into public.crm_tasks)');
 if old_segment is null then raise exception 'Smart file project anchor changed';end if;
 new_segment:=$patch$ if p_data ? 'smart_file_token' then
  select f.client_id,f.project_id into cid,pid from public.crm_issued_files f where f.access_token=p_data->>'smart_file_token';
  if not exists(select 1 from public.clients where id=cid and lower(email)=lower(trim(p_data->>'email'))) then raise exception 'Client identity changed.';end if;
  update public.crm_opportunities set next_follow_up=start_at,version=version+1 where project_id=pid;
 else
$patch$||old_segment||E' end if;\n';
 definition:=replace(definition,old_segment,new_segment);
 old_segment:=' perform public.crm_enqueue_session_notifications(a.id,1,''confirmation'',start_at,a.email_consent);';
 new_segment:=$patch$ if p_data ? 'smart_file_token' then
  insert into public.crm_file_bookings(file_id,appointment_id) select id,a.id from public.crm_issued_files where access_token=p_data->>'smart_file_token';
  update public.crm_billing_invoices set collection_enabled=true where id=(select ac.invoice_id from public.crm_file_acceptances ac join public.crm_issued_files f on f.id=ac.file_id where f.access_token=p_data->>'smart_file_token') and not payment_review_required and reconciliation='verified';
 end if;
$patch$||old_segment;
 if position(old_segment in definition)=0 then raise exception 'Smart file booking anchor changed';end if;
 definition:=replace(definition,old_segment,new_segment);
 execute definition;
end $migration$;

-- Freeze the smart-file return destination with the checkout reservation so
-- provider retries (including office recovery) use identical parameters.
alter table public.crm_billing_checkouts add column return_path text check(return_path is null or return_path ~ '^/smart-files/[a-f0-9]{64}$');
create function public.crm_file_checkout_return() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 select '/smart-files/'||f.access_token into new.return_path from public.crm_file_acceptances a join public.crm_issued_files f on f.id=a.file_id where a.invoice_id=new.invoice_id;
 return new;
end $$;
create trigger crm_file_checkout_return before insert on public.crm_billing_checkouts for each row execute function public.crm_file_checkout_return();
revoke all on function public.crm_file_checkout_return() from public,anon,authenticated;

-- Preserve the full payment window for newly issued booking files without
-- modifying the expiration or content of any existing issued file.
create function public.crm_file_booking_expiry() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cfg jsonb;
begin
 select value into cfg from jsonb_array_elements(new.snapshot->'blocks') where value->>'kind'='experience';
 if cfg is not null then new.expires_at:=new.expires_at+make_interval(days=>coalesce((cfg->>'balance_days')::int,30)+60);end if;
 return new;
end $$;
create trigger crm_file_booking_expiry before insert on public.crm_issued_files for each row execute function public.crm_file_booking_expiry();
revoke all on function public.crm_file_booking_expiry() from public,anon,authenticated;

-- Cancelling a reserved session or revoking its file holds new collection.
-- A Stripe session already processing still follows the existing review flow.
create function public.crm_file_collection_hold() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_table_name='crm_appointments' then
  if new.status='cancelled' and old.status<>'cancelled' then
   update public.crm_billing_invoices set collection_enabled=false,version=version+1 where id in (select a.invoice_id from public.crm_file_acceptances a join public.crm_file_bookings b on b.file_id=a.file_id where b.appointment_id=new.id);
  end if;
 else
  if new.revoked_at is not null and old.revoked_at is null then
   update public.crm_billing_invoices set collection_enabled=false,version=version+1 where id in (select invoice_id from public.crm_file_acceptances where file_id=new.id);
  end if;
 end if;
 return new;
end $$;
create trigger crm_file_cancel_collection after update on public.crm_appointments for each row execute function public.crm_file_collection_hold();
create trigger crm_file_revoke_collection after update on public.crm_issued_files for each row execute function public.crm_file_collection_hold();
revoke all on function public.crm_file_collection_hold() from public,anon,authenticated;

-- Only a credited booking payment can advance an open project to booked.
-- Existing won/archived/lost stages and onboarding enrollment are untouched.
create function public.crm_file_mark_booked() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.crm_file_acceptances; f public.crm_issued_files; booked_stage uuid; cfg jsonb;
begin
 if new.paid_cents=old.paid_cents then return new;end if;
 select * into a from public.crm_file_acceptances where invoice_id=new.invoice_id;
 if not found or new.paid_cents<a.deposit_cents then return new;end if;
 if new.id<>(select id from public.crm_billing_installments where invoice_id=new.invoice_id order by due_date,created_at,id limit 1) then return new;end if;
 select * into f from public.crm_issued_files where id=a.file_id;
 if f.revoked_at is not null or exists(select 1 from public.crm_billing_invoices where id=a.invoice_id and payment_review_required) then return new;end if;
 select value into cfg from jsonb_array_elements(f.snapshot->'blocks') where value->>'kind'='experience';
 if coalesce(cfg->>'session_slug','')<>'' and not exists(select 1 from public.crm_file_bookings b join public.crm_appointments ap on ap.id=b.appointment_id where b.file_id=f.id and ap.status='confirmed') then return new;end if;
 select id into booked_stage from public.crm_stages where outcome='won' order by position,id limit 1;
 if booked_stage is not null then
  update public.crm_opportunities o set stage_id=booked_stage,version=version+1 where o.project_id=f.project_id and exists(select 1 from public.crm_stages where id=o.stage_id and outcome='open');
  if found then insert into public.crm_events(client_id,project_id,kind,body,details) values(f.client_id,f.project_id,'smart_file_booked','Booking payment received; project booked',jsonb_build_object('file_id',f.id,'invoice_id',a.invoice_id));end if;
 end if;
 return new;
end $$;
create trigger crm_file_mark_booked after update of paid_cents on public.crm_billing_installments for each row execute function public.crm_file_mark_booked();
revoke all on function public.crm_file_mark_booked() from public,anon,authenticated;
