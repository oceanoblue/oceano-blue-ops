-- 0060: Seam-1 reconciliation (Option B) + multi-photographer acq slots.
--
-- Context (handoff Item 3): assignment is orders.contractor_id, scheduling is
-- orders.photographer_id, and a person can exist in both tables with nothing
-- reconciling them. Option B (chosen): keep the two tables (pay vs
-- schedulability are genuinely different concerns) but LINK them and add one
-- view that resolves "who is doing this shoot" so everything reads identity the
-- same way. Also fix the acq funnel's single-photographer slot function.

-- 1) Link contractors → their team_member (nullable). Pay and scheduling stay
--    distinct; a contractor who is also a schedulable team member is connected.
alter table public.contractors
  add column if not exists team_member_id uuid references public.team_members(id) on delete set null;

-- Backfill by exact, case-insensitive email match. Both current contractors
-- (Gustavo, Karen) map cleanly to their team_members row.
update public.contractors c
   set team_member_id = tm.id
  from public.team_members tm
 where lower(tm.email::text) = lower(c.email::text)
   and c.team_member_id is null;

create index if not exists contractors_team_member_idx on public.contractors(team_member_id);

-- 2) Resolving view: one place to answer "who's doing this shoot" and which
--    team_member id to use for scheduling/availability. Assignment is by
--    contractor_id today; a contractor resolves to its linked team_member for
--    scheduling, otherwise the order's photographer_id is used directly.
--    security_invoker so it respects the caller's RLS on the base tables.
create or replace view public.v_shoot_assignee
  with (security_invoker = true) as
select
  o.id            as order_id,
  o.order_number,
  case
    when o.contractor_id   is not null then 'contractor'
    when o.photographer_id is not null then 'team'
    else null
  end             as assignee_kind,
  o.contractor_id,
  o.photographer_id,
  coalesce(c.team_member_id, o.photographer_id) as schedule_member_id,
  coalesce(c.full_name, tm.full_name)           as assignee_name
from public.orders o
left join public.contractors  c  on c.id  = o.contractor_id
left join public.team_members tm on tm.id = o.photographer_id;

grant select on public.v_shoot_assignee to authenticated;

-- Note: the acq-funnel single-photographer slot function (acq.available_slots)
-- is a SEPARATE concern (seam 2) and is handled in its own migration, since the
-- platform's own booking (/api/availability) is already multi-photographer.
