-- =============================================================
-- 0069a — Backfill: contractor assignment response (accept/decline)
-- =============================================================
-- These objects were applied to the live DB out-of-band and were never checked
-- into supabase/migrations/ — they are used by RespondControl and by the
-- field_orders view (0070/0071), so this file backfills their exact production
-- definitions for a reproducible source of truth.
--
-- Numbered 0069a (sorts AFTER 0069_dropbox_archive, BEFORE 0070) on purpose:
-- 0070's field_orders view SELECTs orders.contractor_response, so on a clean
-- `supabase db reset` these columns must exist first. Everything here is
-- idempotent, so applying it to prod (which already has these objects) is a
-- no-op.
-- =============================================================

-- 1. Contractor accept/decline columns on orders --------------------------------
alter table orders
  add column if not exists contractor_response      text,          -- 'accepted' | 'declined'
  add column if not exists contractor_responded_at  timestamptz,
  add column if not exists contractor_response_note text;

-- 2. Assignment event log -------------------------------------------------------
create table if not exists assignment_events (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  contractor_id uuid not null references contractors(id),
  event         text not null,                 -- 'accepted' | 'declined'
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists assignment_events_order_idx
  on assignment_events (order_id, created_at desc);

-- RLS enabled with NO policies: deny-all to anon/authenticated. Writes happen
-- only through respond_to_assignment() (SECURITY DEFINER); the office reads it
-- via the service-role admin client. Matches prod.
alter table assignment_events enable row level security;

-- 3. respond_to_assignment() — contractor accepts/declines their own shoot ------
-- Re-derives the caller's contractor from auth.uid(); only touches an order that
-- is theirs and still live; logs the event. Returns a jsonb {ok, ...} result.
create or replace function respond_to_assignment(p_order_id uuid, p_response text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me    uuid;
  v_order public.orders%rowtype;
begin
  if p_response not in ('accepted','declined') then
    raise exception 'response must be accepted or declined, got %', p_response;
  end if;

  select c.id into v_me from public.contractors c
   where c.auth_user_id = auth.uid() and c.is_active limit 1;
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'no_contractor_for_this_login');
  end if;

  update public.orders o
     set contractor_response      = p_response,
         contractor_responded_at  = now(),
         contractor_response_note = nullif(btrim(coalesce(p_note,'')), ''),
         updated_at               = now()
   where o.id = p_order_id
     and o.contractor_id = v_me
     and o.archived_at is null
     and o.status not in ('cancelled','draft')
  returning * into v_order;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_your_assignment');
  end if;

  insert into public.assignment_events (order_id, contractor_id, event, note)
  values (p_order_id, v_me, p_response, nullif(btrim(coalesce(p_note,'')), ''));

  return jsonb_build_object('ok', true, 'order_number', v_order.order_number,
                            'response', p_response, 'at', v_order.contractor_responded_at);
end
$function$;

revoke all on function respond_to_assignment(uuid, text, text) from public, anon;
grant execute on function respond_to_assignment(uuid, text, text) to authenticated;
