import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { fmtRelative } from '@/lib/utils/format';

/**
 * At-a-glance verdict from the most recent delivery QC report for an order —
 * shown on the order page so the team sees "does this set meet its profile bar?"
 * without re-running the check. Reads the persisted `photo_qc_reports.summary`
 * (see /api/ai/qc-review). Server component; presentational only.
 */
export function QcVerdictSummary({
  summary,
  createdAt,
}: {
  summary: any;
  createdAt?: string | null;
}) {
  if (!summary) return null;

  const pass: boolean | undefined = typeof summary.pass === 'boolean' ? summary.pass : undefined;
  const score: number | null = typeof summary.consistency_score === 'number' ? summary.consistency_score : null;
  const minScore: number | null = typeof summary.min_score === 'number' ? summary.min_score : null;
  const reasons: string[] = Array.isArray(summary.verdict_reasons) ? summary.verdict_reasons : [];

  const tone =
    pass === undefined
      ? { box: 'border-slate-200 bg-slate-50', text: 'text-slate-600', Icon: ShieldQuestion, label: 'QC run' }
      : pass
      ? { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800', Icon: ShieldCheck, label: 'Meets profile bar' }
      : { box: 'border-rose-200 bg-rose-50', text: 'text-rose-800', Icon: ShieldAlert, label: 'Below profile bar' };
  const { Icon } = tone;

  return (
    <div className={`mb-4 rounded-lg border px-3 py-2 ${tone.box}`}>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium ${tone.text}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span>Delivery QC: {tone.label}</span>
        {summary.profile && <span className="font-normal opacity-75">· {summary.profile}</span>}
        {score !== null && (
          <span className="font-normal opacity-75">
            · {score}/100{minScore !== null ? ` (need ${minScore})` : ''}
          </span>
        )}
        {createdAt && <span className="font-normal opacity-60">· {fmtRelative(createdAt)}</span>}
      </div>
      {pass === false && reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-rose-700">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="list-disc">{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
