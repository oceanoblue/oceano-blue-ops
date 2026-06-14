import { createAdminClient } from '@/lib/supabase/server';
import { captureError, logEvent } from '@/lib/observability/report';

/**
 * Recover orphaned AI jobs stuck in 'running' (function timeout / OOM / hung
 * provider). Delegates to the atomic `reap_stale_ai_jobs` RPC (migration 0038):
 * jobs past the stale window are requeued (under max attempts) or failed.
 * Fail-soft: a reaper error must never break the cron tick.
 */
const STALE_SECONDS = (() => {
  const v = parseInt(process.env.AI_JOB_STALE_SECONDS || '600', 10);
  return Number.isFinite(v) && v > 0 ? v : 600;
})();
const MAX_ATTEMPTS = (() => {
  const v = parseInt(process.env.AI_JOB_MAX_ATTEMPTS || '3', 10);
  return Number.isFinite(v) && v > 0 ? v : 3;
})();

export async function reapStaleAiJobs(): Promise<{
  requeued: number;
  failed: number;
  error?: string;
}> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('reap_stale_ai_jobs', {
      p_stale_seconds: STALE_SECONDS,
      p_max_attempts: MAX_ATTEMPTS,
    } as any);
    if (error) {
      captureError('ai.reaper', error);
      return { requeued: 0, failed: 0, error: error.message };
    }
    const row = Array.isArray(data) ? data[0] : data;
    const result = { requeued: (row as any)?.requeued ?? 0, failed: (row as any)?.failed ?? 0 };
    if (result.failed > 0 || result.requeued > 0) {
      logEvent('ai.reaper', 'reaped', result);
    }
    return result;
  } catch (e: any) {
    captureError('ai.reaper', e);
    return { requeued: 0, failed: 0, error: e?.message || String(e) };
  }
}
