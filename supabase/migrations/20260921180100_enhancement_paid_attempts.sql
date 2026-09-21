-- Do not automatically repeat an ambiguous paid render or mark its source failed.
create or replace function public.reap_stale_ai_jobs(
  p_stale_seconds int default 600, p_max_attempts int default 3
) returns table(requeued int, failed int)
language plpgsql security definer set search_path = public as $$
declare r int; f int;
begin
  update public.ai_jobs
    set status = 'failed', completed_at = now(),
        error_message = case when params->>'paid_request_started' = 'true'
          then 'interrupted_paid_render: check the previous attempt before requesting another paid edit'
          else coalesce(error_message, 'reaped: maximum attempts reached') end
    where status = 'running'
      and started_at < now() - make_interval(secs => greatest(p_stale_seconds, 300))
      and (attempts >= p_max_attempts or params->>'paid_request_started' = 'true');
  get diagnostics f = row_count;
  update public.ai_jobs set status = 'pending', started_at = null, attempts = attempts + 1
    where status = 'running'
      and started_at < now() - make_interval(secs => greatest(p_stale_seconds, 300))
      and attempts < p_max_attempts
      and coalesce(params->>'paid_request_started', 'false') <> 'true';
  get diagnostics r = row_count;
  return query select r, f;
end;
$$;
revoke all on function public.reap_stale_ai_jobs(int, int) from public, anon, authenticated;
grant execute on function public.reap_stale_ai_jobs(int, int) to service_role;
