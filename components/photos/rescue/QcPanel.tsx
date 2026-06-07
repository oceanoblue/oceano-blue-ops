'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Loader2 } from 'lucide-react';

type Check = { key: string; label: string; status: string; auto: boolean; detail?: string };

const STATUS_STYLE: Record<string, string> = {
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  needs_review: 'bg-amber-100 text-amber-800',
  pending: 'bg-slate-100 text-slate-500',
};

export function QcPanel({
  jobId,
  latest,
}: {
  jobId: string;
  latest: { status: string; quality_score: number | null; checks: Check[]; created_at: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/re-photo/qc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`QC failed: ${j.error ?? res.status}`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Delivery QC</h2>
        <button className="btn-primary" disabled={busy} onClick={run}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          {latest ? 'Re-run QC' : 'Generate QC report'}
        </button>
      </div>

      {!latest ? (
        <p className="text-sm text-slate-500">
          No QC report yet. Generate one to check delivery readiness (automated
          checks + a visual checklist for human sign-off).
        </p>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-3 text-sm">
            <span className={`pill ${STATUS_STYLE[latest.status] ?? ''} capitalize`}>{latest.status.replace(/_/g, ' ')}</span>
            <span className="text-slate-600">Score: <strong>{latest.quality_score}%</strong> (automated)</span>
            <span className="text-slate-400">{new Date(latest.created_at).toLocaleString()}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {latest.checks.map((c) => (
              <li key={c.key} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-700">
                  {c.label}
                  {!c.auto && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">manual</span>}
                  {c.detail && <span className="ml-2 text-xs text-slate-400">{c.detail}</span>}
                </span>
                <span className={`pill ${STATUS_STYLE[c.status] ?? ''} capitalize`}>{c.status.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
