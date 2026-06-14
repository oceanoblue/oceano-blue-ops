-- 0038_ai_job_reaper.sql
-- Reliability: recover orphaned AI jobs. runAiJob() flips a job to 'running'
-- with started_at, but if the Vercel function times out / OOMs / the provider
-- hangs, the job stays 'running' forever — the cron only selects pending/queued,
-- so it is never retried and never surfaces as failed.
--
-- Add an attempt counter and an atomic reaper the cron calls each tick:
--   * jobs 'running' past the stale window with attempts < max  -> requeued
--     (status=pending, started_at cleared, attempts+1)
--   * jobs that have exhausted attempts                          -> failed
--     (and their input photos reset out of the stuck 'running' state)
-- Stale window default 600s > the 300s function maxDuration, so only genuinely
-- dead jobs are touched.

alter table public.ai_jobs add column if not exists attempts int not null default 0;

create or replace function public.reap_stale_ai_jobs(
  p_stale_seconds int default 600,
  p_max_attempts int default 3
)
returns table(requeued int, failed int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r int;
  f int;
begin
  -- Reset photos belonging to jobs we're about to fail (still 'running' now).
  update public.photos p
     set processing_status = 'failed'
   where p.processing_status = 'running'
     and p.id in (
       select unnest(j.input_photo_ids)
         from public.ai_jobs j
        where j.status = 'running'
          and j.started_at < now() - make_interval(secs => p_stale_seconds)
          and j.attempts >= p_max_attempts
     );

  -- Fail jobs that have exhausted their attempts.
  update public.ai_jobs
     set status = 'failed',
         completed_at = now(),
         error_message = coalesce(error_message, 'reaped: stuck in running past timeout (max attempts reached)')
   where status = 'running'
     and started_at < now() - make_interval(secs => p_stale_seconds)
     and attempts >= p_max_attempts;
  get diagnostics f = row_count;

  -- Requeue the rest for another attempt.
  update public.ai_jobs
     set status = 'pending', started_at = null, attempts = attempts + 1
   where status = 'running'
     and started_at < now() - make_interval(secs => p_stale_seconds)
     and attempts < p_max_attempts;
  get diagnostics r = row_count;

  return query select r, f;
end;
$$;

revoke all on function public.reap_stale_ai_jobs(int, int) from public;
revoke all on function public.reap_stale_ai_jobs(int, int) from anon;
revoke all on function public.reap_stale_ai_jobs(int, int) from authenticated;
grant execute on function public.reap_stale_ai_jobs(int, int) to service_role;
