-- Private owner destinations; configure separately from source control.
create table public.payment_alert_settings (
  channel text primary key check (channel in ('email','sms')),
  destination text not null check (length(destination) > 3),
  enabled boolean not null default false,
  enabled_since timestamptz not null default now()
);
create table public.payment_alerts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  channel text not null check (channel in ('email','sms')),
  destination text not null,
  content jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','accepted','failed','needs_review')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  unique(order_id,channel)
);
alter table public.payment_alert_settings enable row level security;
alter table public.payment_alerts enable row level security;
revoke all on public.payment_alert_settings, public.payment_alerts from public, anon, authenticated;
grant select, insert, update, delete on public.payment_alert_settings, public.payment_alerts to service_role;
create index payment_alerts_pending_idx on public.payment_alerts(created_at) where status='pending';
create index orders_paid_alert_idx on public.orders(download_paid_at) where download_paid_at is not null;

-- Derive alerts from persisted settlement, outside Stripe's payment transaction.
-- One claim per call keeps unattempted messages pending if a worker stops.
create function public.claim_payment_alert() returns setof public.payment_alerts
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.payment_alerts(order_id,channel,destination,content)
  select o.id,s.channel,s.destination,jsonb_build_object(
    'orderNumber',o.order_number,'amountCents',o.download_paid_cents,
    'paidAt',o.download_paid_at,'clientName',coalesce(c.full_name,'Client'),
    'address',coalesce(l.address_line1,'Order #'||o.order_number))
  from public.orders o cross join public.payment_alert_settings s
  left join public.clients c on c.id=o.client_id
  left join public.listings l on l.id=o.listing_id
  where s.enabled and o.download_paid_at >= s.enabled_since
    and o.download_stripe_session_id like 'cs_live_%'
    and o.download_paid_cents > 0
  on conflict(order_id,channel) do nothing;

  -- A lost provider response is ambiguous. Never blindly resend it.
  update public.payment_alerts set status='needs_review',
    error='Sending was interrupted. Check the provider before retrying.',completed_at=now()
  where status='sending' and claimed_at < now()-interval '5 minutes';

  return query
  update public.payment_alerts a set status='sending',claimed_at=now()
  where a.id=(select q.id from public.payment_alerts q
    join public.payment_alert_settings s on s.channel=q.channel and s.enabled
      and s.destination=q.destination
    where q.status='pending' order by q.created_at,q.id
    for update of q skip locked limit 1)
  returning a.*;
end;
$$;
revoke all on function public.claim_payment_alert() from public, anon, authenticated;
grant execute on function public.claim_payment_alert() to service_role;
