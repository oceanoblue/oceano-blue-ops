-- =============================================================
-- 0057 — Contractor weekly pay requests (contractor portal Phase 2)
-- =============================================================
-- The payout flow 0053 deferred: each week a contractor reviews their
-- completed-but-unpaid shoots in /field, picks the ones to invoice, and
-- submits a pay request. The office sees pending requests on
-- /dashboard/contractors and marks them paid, which settles the underlying
-- orders (pay_status → 'paid') in the same transaction.
--
-- Security model matches 0053/0054:
--   * Contractors touch pay_requests ONLY through SECURITY DEFINER RPCs that
--     re-derive contractor_id server-side; RLS gives them read-only access to
--     their own requests.
--   * Marking a request paid is team-only, enforced inside the RPC via
--     is_team_member() (not trusted from the client).
--   * Amounts come from orders.pay_amount_cents snapshots (0053) — the
--     contractor never supplies a dollar figure.
-- =============================================================

-- 1. Pay requests -------------------------------------------------------------
create table if not exists pay_requests (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  -- The work window this request covers, derived from the shoots claimed
  -- (min/max created_at dates) — not supplied by the client.
  period_start date not null,
  period_end date not null,
  status text not null default 'submitted' check (status in ('submitted', 'paid')),
  -- Snapshots at submit time so the request is a stable record even if
  -- orders are later edited.
  shoot_count int not null default 0,
  total_cents int not null default 0,
  -- Contractor's note to the office (e.g. "week of Jul 27, includes rush").
  notes text,
  -- Office-side settlement details (check #, Zelle ref, etc).
  paid_note text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_requests_contractor_idx on pay_requests(contractor_id);
create index if not exists pay_requests_status_idx on pay_requests(status);
create trigger pay_requests_updated_at before update on pay_requests
  for each row execute procedure set_updated_at();

-- Orders claimed by a request point back at it; null = not yet requested.
alter table orders
  add column if not exists pay_request_id uuid references pay_requests(id) on delete set null;

create index if not exists orders_pay_request_idx on orders(pay_request_id);

-- 2. Row-level security -------------------------------------------------------
alter table pay_requests enable row level security;

-- Team: full access (review, mark paid, correct mistakes).
create policy "team all pay_requests" on pay_requests
  for all using (is_team_member()) with check (is_team_member());

-- Contractor: read only their own requests. All writes go through the RPCs.
create policy "contractor read own pay_requests" on pay_requests
  for select using (contractor_id = current_contractor_id());

-- 3. Submit a pay request (contractor) ----------------------------------------
-- Claims the given orders for the calling contractor and rolls them up into
-- one request. Ownership and eligibility are re-checked server-side: only the
-- caller's own unpaid, unclaimed, payable-status shoots are accepted; anything
-- else in the list is ignored. Payable set mirrors the office roster
-- (app/dashboard/contractors): RAWs in and onward.
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

  insert into pay_requests (contractor_id, period_start, period_end, notes)
  values (v_contractor, current_date, current_date, nullif(trim(p_notes), ''))
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

-- 4. Mark a request paid (team) -----------------------------------------------
-- Settles the request and every order it claims, atomically.
create or replace function mark_pay_request_paid(
  p_request_id uuid,
  p_paid_note  text default null
) returns void language plpgsql security definer
set search_path = public as $$
begin
  if not is_team_member() then
    raise exception 'forbidden';
  end if;

  update pay_requests
     set status = 'paid',
         paid_at = now(),
         paid_note = coalesce(nullif(trim(p_paid_note), ''), paid_note)
   where id = p_request_id
     and status = 'submitted';

  if not found then
    raise exception 'request_not_found_or_already_paid';
  end if;

  update orders
     set pay_status = 'paid', updated_at = now()
   where pay_request_id = p_request_id
     and pay_status = 'unpaid';
end;
$$;

-- 5. Grants -------------------------------------------------------------------
revoke all on function submit_pay_request(uuid[], text) from public, anon;
revoke all on function mark_pay_request_paid(uuid, text) from public, anon;
grant execute on function submit_pay_request(uuid[], text) to authenticated;
grant execute on function mark_pay_request_paid(uuid, text) to authenticated;
