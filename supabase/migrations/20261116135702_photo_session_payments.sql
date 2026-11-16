-- Photo packages use the existing calendar/CRM reservation transaction. Payment
-- holds block the same host as real estate orders, but queue no confirmations.
alter table public.crm_session_types
 add column category text not null default 'general' check(category in ('general','family','individual','company')),
 add column price_cents integer not null default 0 check(price_cents between 0 and 10000000),
 add constraint crm_photo_package_ready check(not published or category='general' or (price_cents>=50 and length(trim(location))>0));
alter table public.crm_appointments drop constraint crm_appointments_status_check;
alter table public.crm_appointments
 add constraint crm_appointments_status_check check(status in ('confirmed','cancelled','pending_payment')),
 add column price_cents integer not null default 0,
 add column payment_status text not null default 'not_required' check(payment_status in ('not_required','pending','paid','expired'));
create table public.crm_session_payments (
 appointment_id uuid primary key references public.crm_appointments(id),
 amount_cents integer not null check(amount_cents>=50),
 stripe_session_id text unique,
 checkout_url text,
 expires_at timestamptz not null default (date_trunc('second',now())+interval '45 minutes'),
 paid_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.crm_session_payments enable row level security;
revoke all on public.crm_session_payments from anon,authenticated;
grant select,insert,update on public.crm_session_payments to service_role;

-- Patch the current definitions to retain smart-file and source-import behavior.
do $migration$
declare d text;old text;
begin
 select pg_get_functiondef('public.crm_session_type_save(uuid,uuid,integer,jsonb)'::regprocedure) into d;
 old:='confirmation_instructions)';
 if position(old in d)=0 then raise exception 'Session save column anchor missing';end if;
 d:=replace(d,old,'confirmation_instructions,category,price_cents)');
 old:='coalesce(p_data->>''confirmation_instructions'',''''))';
 if position(old in d)=0 then raise exception 'Session save values anchor missing';end if;
 d:=replace(d,old,'coalesce(p_data->>''confirmation_instructions'',''''),coalesce(p_data->>''category'',''general''),coalesce((p_data->>''price_cents'')::integer,0))');
 d:=replace(d,'confirmation_instructions=excluded.confirmation_instructions,version=', 'confirmation_instructions=excluded.confirmation_instructions,category=excluded.category,price_cents=excluded.price_cents,version=');
 execute d;
 select pg_get_functiondef('public.crm_session_commit(uuid,text,text,jsonb,integer,timestamp with time zone)'::regprocedure) into d;
 old:=' perform public.crm_enqueue_session_notifications(a.id,1,''confirmation'',start_at,a.email_consent);';
 if position(old in d)=0 then raise exception 'Session confirmation anchor missing';end if;
 d:=replace(d,old,$patch$
 if t.category<>'general' then
  if p_data ? 'smart_file_token' then raise exception 'Paid packages require direct checkout';end if;
  update public.crm_appointments set status='pending_payment',price_cents=t.price_cents,payment_status='pending' where id=a.id;
  insert into public.crm_session_payments(appointment_id,amount_cents) values(a.id,t.price_cents);
 else
  perform public.crm_enqueue_session_notifications(a.id,1,'confirmation',start_at,a.email_consent);
 end if;
$patch$);
 execute d;
 select pg_get_functiondef('public.crm_session_change(uuid,text,uuid,text,integer,timestamp with time zone,timestamp with time zone,integer)'::regprocedure) into d;
 old:=' if a.status=''cancelled'' then';
 if position(old in d)=0 then raise exception 'Session change anchor missing';end if;
 d:=replace(d,old,' if a.status=''pending_payment'' then raise exception ''Complete checkout before changing this session.'';end if;'||E'\n'||old);
 old:='  end_at:=p_start+make_interval(mins=>t.duration_minutes);';
 if position(old in d)=0 then raise exception 'Session duration anchor missing';end if;
 d:=replace(d,old,'  if a.payment_status=''paid'' and extract(epoch from (a.ends_at-a.starts_at))/60<>t.duration_minutes then raise exception ''Contact the office to reschedule this package.'';end if;'||E'\n'||old);
 execute d;
end $migration$;

-- Only a verified Stripe session may confirm or expire a hold. No wall-clock
-- release: a delayed webhook must never sell a slot that has already been paid.
create function public.crm_session_payment_result(p_id uuid,p_session text,p_amount integer,p_currency text,p_paid boolean)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.crm_appointments%rowtype;p public.crm_session_payments%rowtype;
begin
 select * into a from public.crm_appointments where id=p_id for update;
 if not found then raise exception 'Session not found';end if;
 select * into p from public.crm_session_payments where appointment_id=p_id for update;
 if not found or p_session is null or p_session='' or p.amount_cents is distinct from p_amount or p_currency is distinct from 'usd' or (p.stripe_session_id is not null and p.stripe_session_id<>p_session) then raise exception 'Payment does not match reservation';end if;
 if a.payment_status='paid' or (a.payment_status='expired' and not p_paid) then return;end if;
 if a.status<>'pending_payment' or a.payment_status<>'pending' then raise exception 'Reservation is no longer pending';end if;
 perform pg_advisory_xact_lock(hashtext(a.owner_id::text)::bigint);
 update public.crm_session_payments set stripe_session_id=p_session,paid_at=case when p_paid then now() else null end where appointment_id=p_id;
 if p_paid then
  update public.crm_appointments set status='confirmed',payment_status='paid',updated_at=now() where id=p_id;
  perform public.crm_enqueue_session_notifications(a.id,a.version,'confirmation',a.starts_at,a.email_consent);
  insert into public.crm_events(client_id,project_id,kind,body,details) values(a.client_id,a.project_id,'session_paid','Photo session paid in full',jsonb_build_object('appointment_id',a.id,'amount_cents',p.amount_cents,'stripe_session_id',p_session));
 else
  update public.crm_appointments set status='cancelled',payment_status='expired',version=version+1,updated_at=now() where id=p_id;
  update public.schedule_blocks set is_available=true,reason='crm-session-payment-expired:'||a.id where id=a.schedule_block_id;
  update public.crm_tasks set completed_at=now(),version=version+1 where id=a.task_id and completed_at is null;
  insert into public.crm_events(client_id,project_id,kind,body,details) values(a.client_id,a.project_id,'session_payment_expired','Photo session checkout expired; time released',jsonb_build_object('appointment_id',a.id));
 end if;
end $$;
revoke all on function public.crm_session_payment_result(uuid,text,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.crm_session_payment_result(uuid,text,integer,text,boolean) to service_role;

-- Start with editable, unpublished packages using the matching existing host
-- and calendar settings. Prices remain unset until the office supplies them.
insert into public.crm_session_types(name,slug,description,owner_id,duration_minutes,timezone,availability,notice_minutes,horizon_days,buffer_minutes,location,published,slot_interval_minutes,booking_horizon_months,use_session_as_project_date,buffer_before_minutes,buffer_after_minutes,category,price_cents)
select seed.name,seed.slug,seed.description,t.owner_id,t.duration_minutes,t.timezone,t.availability,greatest(t.notice_minutes,1440),t.horizon_days,t.buffer_minutes,t.location,false,t.slot_interval_minutes,t.booking_horizon_months,true,t.buffer_before_minutes,t.buffer_after_minutes,seed.category,0
from (values
 ('Family Photo Session','family-photo-session','A photo session for your family. Contact us with your group size and any special requests.','family','portrait-sessions'),
 ('Individual Photo Session','individual-photo-session','Portraits and headshots for individuals. Tell us how you plan to use your photos.','individual','headshots-mini-session'),
 ('Company Photo Session','company-photo-session','Photography for your company or team. Tell us your team size and photography needs.','company','commercial-photo-shoot')
) as seed(name,slug,description,category,template_slug)
join public.crm_session_types t on t.slug=seed.template_slug
on conflict(slug) do nothing;
