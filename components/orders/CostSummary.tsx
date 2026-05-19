import { DollarSign, Loader2 } from 'lucide-react';

interface AiJobLite {
  id: string;
  status: string;
  provider: string | null;
  cost_cents: number | null;
  duration_ms: number | null;
}

const PROVIDER_LABEL: Record<string, string> = {
  'oceano-enhance': 'Oceano Enhance',
  'autoenhance': 'Autoenhance.ai',
  'openai-gpt-image': 'GPT Image 2',
  'gemini-banana-pro': 'Nano Banana',
};

/**
 * Roll up cost + duration for every AI job on this order. Renders broken
 * down by provider so you can see exactly where the spend is going. All
 * arithmetic is done in cents to avoid float drift, formatted to dollars at
 * the very end.
 */
export function CostSummary({ jobs }: { jobs: AiJobLite[] }) {
  if (jobs.length === 0) return null;

  type Row = { count: number; cents: number; ms: number; failed: number; pending: number };
  const byProvider = new Map<string, Row>();
  let totalCents = 0;
  let totalMs = 0;
  let failed = 0;
  let pending = 0;
  let complete = 0;

  for (const j of jobs) {
    const key = j.provider ?? 'unknown';
    const row = byProvider.get(key) ?? { count: 0, cents: 0, ms: 0, failed: 0, pending: 0 };
    row.count += 1;
    row.cents += j.cost_cents ?? 0;
    row.ms += j.duration_ms ?? 0;
    if (j.status === 'failed') {
      row.failed += 1;
      failed += 1;
    } else if (j.status === 'pending' || j.status === 'queued' || j.status === 'running') {
      row.pending += 1;
      pending += 1;
    } else if (j.status === 'complete') {
      complete += 1;
    }
    byProvider.set(key, row);
    totalCents += j.cost_cents ?? 0;
    totalMs += j.duration_ms ?? 0;
  }

  return (
    <section className="card p-6">
      <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-slate-500" /> AI spend
      </h2>
      <div className="space-y-2 text-sm">
        {Array.from(byProvider.entries()).map(([provider, row]) => (
          <div key={provider} className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-medium truncate">{PROVIDER_LABEL[provider] ?? provider}</div>
              <div className="text-xs text-slate-500">
                {row.count} job{row.count === 1 ? '' : 's'}
                {row.pending > 0 && ` · ${row.pending} pending`}
                {row.failed > 0 && ` · ${row.failed} failed`}
              </div>
            </div>
            <div className="text-right font-mono">
              ${(row.cents / 100).toFixed(2)}
            </div>
          </div>
        ))}
        <div className="border-t pt-2 mt-2 flex items-center justify-between">
          <div>
            <div className="font-semibold">Total</div>
            <div className="text-xs text-slate-500">
              {complete} done
              {pending > 0 && ` · ${pending} pending`}
              {failed > 0 && ` · ${failed} failed`}
              {totalMs > 0 && ` · ${(totalMs / 1000).toFixed(0)}s total compute`}
            </div>
          </div>
          <div className="text-right font-mono font-semibold inline-flex items-center gap-1">
            {pending > 0 && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
            ${(totalCents / 100).toFixed(2)}
          </div>
        </div>
      </div>
    </section>
  );
}
