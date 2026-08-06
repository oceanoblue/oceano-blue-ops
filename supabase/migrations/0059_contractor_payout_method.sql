-- =============================================================
-- 0059 — Contractor payout method (how they'd like to get paid)
-- =============================================================
-- Photographers pick a payout method (ACH, Zelle, Venmo, PayPal, check,
-- other) plus a short details line (Zelle email/phone, @venmo handle, ...)
-- in the field portal. Each pay request snapshots the method at submit time
-- so the office inbox always shows how to pay THAT request, even if the
-- contractor changes methods later.
--
-- Deliberately NOT stored here: full bank account / routing numbers. For
-- ACH the details line should hold something safe (bank name + last 4);
-- the office collects full banking info through a secure channel.
--
-- Contractors update only their own method via a SECURITY DEFINER RPC
-- (they have no UPDATE policy on contractors), same model as 0053.
-- =============================================================

-- 1. Columns ------------------------------------------------------------------
alter table contractors
  add column if not exists payout_method text
    check (payout_method in ('ach','zelle','venmo','paypal','check','other')),
  add column if not exists payout_details text;

alter table pay_requests
  add column if not exists payout_method text,
  add column if not exists payout_details text;

-- 2. Contractor self-service RPC ---------------------------------------------
create or replace function set_contractor_payout(
  p_method  text,
  p_details text default null
) returns void language plpgsql security definer
set search_path = public as $$
declare
  v_contractor uuid := current_contractor_id();
begin
  if v_contractor is null then
    raise exception 'not_a_contractor';
  end if;
  if p_method is null or p_method not in ('ach','zelle','venmo','paypal','check','other') then
    raise exception 'invalid_payout_method';
  end if;

  update contractors
     set payout_method  = p_method,
         payout_details = nullif(trim(p_details), ''),
         updated_at     = now()
   where id = v_contractor;
end;
$$;

-- 3. Snapshot the payout method on each pay request ---------------------------
-- Same signature as 0057; adds the payout snapshot at submit time.
create or replace function submit_pay_request(
  p_order_ids uuid[],
  p_notes     text default null
) returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_contractor uuid := current_contractor_id();
  v_request    uuid;
  v_claimed    int;
begin
  if v_contractor is null then
    raise exception 'not_a_contractor';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'no_shoots_selected';
  end if;

  insert into pay_requests (contractor_id, period_start, period_end, notes, payout_method, payout_details)
  select c.id, current_date, current_date, nullif(trim(p_notes), ''), c.payout_method, c.payout_details
    from contractors c where c.id = v_contractor
  returning id into v_request;

  update orders
     set pay_request_id = v_request, updated_at = now()
   where id = any(p_order_ids)
     and contractor_id = v_contractor
     and pay_status = 'unpaid'
     and pay_request_id is null
     and status in ('uploaded', 'processing', 'editing', 'ready', 'delivered');

  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    -- Nothing eligible (already claimed / already paid / RAWs not in yet).
    -- Raising rolls back the empty request row too.
    raise exception 'no_eligible_shoots';
  end if;

  update pay_requests pr
     set shoot_count  = agg.n,
         total_cents  = agg.total,
         period_start = agg.first_day,
         period_end   = agg.last_day
    from (
      select count(*)::int as n,
             coalesce(sum(o.pay_amount_cents), 0)::int as total,
             min(coalesce(o.scheduled_at, o.created_at))::date as first_day,
             max(coalesce(o.scheduled_at, o.created_at))::date as last_day
        from orders o
       where o.pay_request_id = v_request
    ) agg
   where pr.id = v_request;

  return v_request;
end;
$$;

-- 4. Grants -------------------------------------------------------------------
revoke all on function set_contractor_payout(text, text) from public, anon;
grant execute on function set_contractor_payout(text, text) to authenticated;
-- submit_pay_request keeps its 0057 grants (create or replace preserves them).
