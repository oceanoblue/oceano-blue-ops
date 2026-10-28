-- Freeze wedding deadlines at issuance, without changing existing documents.
create or replace function public.crm_file_booking_expiry() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cfg jsonb; event_date date; balance_date date;
begin
 select value into cfg from jsonb_array_elements(new.snapshot->'blocks') where value->>'kind'='experience';
 if cfg is not null then
  if cfg->>'balance_timing'='month_before_project' then
   select project_date into event_date from public.crm_opportunities where project_id=new.project_id;
   if event_date is null then raise exception 'Set the project event date before issuing this file.';end if;
   balance_date:=(event_date-interval '1 month')::date;
   if balance_date<=(now() at time zone 'America/New_York')::date then raise exception 'Review payment terms for events within one calendar month.';end if;
   new.context:=new.context||jsonb_build_object('project_date',event_date::text,'balance_due_date',balance_date::text);
   new.expires_at:=greatest(new.expires_at,(event_date::timestamp at time zone 'America/New_York')+interval '60 days');
  else
   new.expires_at:=new.expires_at+make_interval(days=>coalesce((cfg->>'balance_days')::int,30)+60);
  end if;
 end if;
 return new;
end $$;

create or replace function public.crm_file_accept(p_token text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
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
 if cfg->>'balance_timing'='month_before_project' then
  if nullif(f.context->>'balance_due_date','') is null or (f.context->>'balance_due_date')::date<=dt then
   return jsonb_build_object('error','The office must review the event payment deadline before you sign.');
  end if;
  if (select project_date from public.crm_opportunities where project_id=f.project_id) is distinct from (f.context->>'project_date')::date then
   return jsonb_build_object('error','The event date changed. Ask the office for an updated file.');
  end if;
 end if;
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
 if total>deposit then insert into public.crm_billing_installments(invoice_id,title,amount_cents,due_date,due_date_verified) values(inv,'Remaining balance',total-deposit,case when cfg->>'balance_timing'='month_before_project' then (f.context->>'balance_due_date')::date else dt+(cfg->>'balance_days')::int end,true);end if;
 insert into public.crm_file_acceptances(file_id,project_id,invoice_id,package_id,addon_ids,signer_name,signer_email,agreement,consent_text,answers,document_hash,payload_hash,ip_hash,user_agent,total_cents,deposit_cents)
 values(f.id,f.project_id,inv,(p_data->>'package_id')::uuid,p_data->'addon_ids',trim(p_data->>'signer_name'),lower(trim(p_data->>'signer_email')),p_data->>'agreement',p_data->>'consent_text',p_data->'answers',p_data->>'document_hash',p_data->>'payload_hash',p_data->>'ip_hash',left(p_data->>'user_agent',500),total,deposit);
 update public.crm_issued_files set responded_at=coalesce(responded_at,now()) where id=f.id;
 update public.crm_acquisition_jobs set status='cancelled',last_error='Client accepted the smart file.' where project_id=f.project_id and sequence_id is not null and status in ('queued','needs_approval','leased');
 insert into public.crm_events(client_id,project_id,kind,body,details) values(f.client_id,f.project_id,'smart_file_signed','Client selected services and signed the agreement',jsonb_build_object('file_id',f.id,'invoice_id',inv,'total_cents',total,'document_hash',p_data->>'document_hash'));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.crm_file_accept(text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_file_accept(text,jsonb) to service_role;


-- A separate immutable record countersigns the client's exact frozen agreement.
create table public.crm_file_countersignatures (
 file_id uuid primary key references public.crm_file_acceptances(file_id),
 actor_id uuid not null references public.team_members(id),
 signer_name text not null check(length(trim(signer_name)) between 2 and 120),
 document_hash text not null check(document_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text not null,
 consent_text text not null,
 ip_hash text not null,
 user_agent text not null,
 signed_at timestamptz not null default now()
);
alter table public.crm_file_countersignatures enable row level security;
revoke all on public.crm_file_countersignatures from public,anon,authenticated,service_role;
grant select,insert on public.crm_file_countersignatures to service_role;
create trigger crm_file_countersignature_immutable before update or delete on public.crm_file_countersignatures for each row execute function public.crm_file_acceptance_immutable();

create function public.crm_file_countersign(p_actor uuid,p_file uuid,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public.crm_issued_files; a public.crm_file_acceptances; cfg jsonb; previous public.crm_file_countersignatures;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 select * into f from public.crm_issued_files where id=p_file for update;
 if not found or f.revoked_at is not null then return jsonb_build_object('error','File unavailable.');end if;
 if not exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id join public.clients c on c.id=o.client_id where o.project_id=f.project_id and s.outcome in ('open','won') and not c.is_archived) then return jsonb_build_object('error','This project is no longer accepting agreements.');end if;
 select * into a from public.crm_file_acceptances where file_id=f.id;
 if not found then return jsonb_build_object('error','The client must sign first.');end if;
 select * into previous from public.crm_file_countersignatures where file_id=f.id;
 if found then
  if previous.actor_id=p_actor and previous.signer_name=trim(p_data->>'signer_name') and previous.document_hash=p_data->>'document_hash' and previous.payload_hash=p_data->>'payload_hash' then return jsonb_build_object('ok',true);end if;
  return jsonb_build_object('error','This agreement has already been countersigned.');
 end if;
 if f.expires_at<=now() then return jsonb_build_object('error','File expired. Review the agreement before proceeding.');end if;
 select value into cfg from jsonb_array_elements(f.snapshot->'blocks') where value->>'kind'='experience';
 if not coalesce((cfg->>'require_countersign')::boolean,false) then return jsonb_build_object('error','This file does not require an office signature.');end if;
 if p_data->>'document_hash' is distinct from a.document_hash or p_data->>'payload_hash' is distinct from a.payload_hash then return jsonb_build_object('error','Agreement changed. Reload before signing.');end if;
 if (p_data->>'consent')::boolean is distinct from true or length(trim(coalesce(p_data->>'signer_name',''))) not between 2 and 120 then return jsonb_build_object('error','Enter your name and confirm your signature.');end if;
 insert into public.crm_file_countersignatures(file_id,actor_id,signer_name,document_hash,payload_hash,consent_text,ip_hash,user_agent)
 values(f.id,p_actor,trim(p_data->>'signer_name'),a.document_hash,a.payload_hash,p_data->>'consent_text',p_data->>'ip_hash',left(p_data->>'user_agent',500));
 insert into public.crm_events(client_id,project_id,kind,body,details) values(f.client_id,f.project_id,'smart_file_countersigned','Office countersigned the client agreement',jsonb_build_object('file_id',f.id,'actor_id',p_actor,'document_hash',a.document_hash));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.crm_file_countersign(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_file_countersign(uuid,uuid,jsonb) to service_role;
