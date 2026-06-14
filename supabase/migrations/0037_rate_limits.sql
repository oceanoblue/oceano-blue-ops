-- 0037_rate_limits.sql
-- Durable fixed-window rate limiting for public, unauthenticated endpoints
-- (booking, availability) which otherwise allow DB + calendar spam and
-- cost-amplification DoS. No Redis/KV in the stack, so this uses Postgres:
-- one row per (scope:ip:window-bucket) with an atomic increment.
--
-- Called only from server routes via the service-role client; the RPC is
-- locked down so anon/authenticated cannot touch it directly.

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  created_at timestamptz not null default now()
);

-- Supports periodic pruning of expired buckets.
create index if not exists rate_limits_created_at_idx on public.rate_limits (created_at);

-- RLS on with no policy => no anon/authenticated access; service role bypasses.
alter table public.rate_limits enable row level security;

-- Atomic "increment and return new count" for a window bucket.
create or replace function public.bump_rate_limit(p_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  insert into public.rate_limits (key, count)
  values (p_key, 1)
  on conflict (key) do update set count = public.rate_limits.count + 1
  returning count into v;
  return v;
end;
$$;

-- Lock the function down: only the service role (used by server routes) may run it.
revoke all on function public.bump_rate_limit(text) from public;
revoke all on function public.bump_rate_limit(text) from anon;
revoke all on function public.bump_rate_limit(text) from authenticated;
grant execute on function public.bump_rate_limit(text) to service_role;
