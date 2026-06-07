'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitMerge, Scissors, Loader2, AlertTriangle, Layers } from 'lucide-react';

export type ReviewItem = {
  asset_id: string;
  role: string | null;
  sort_order: number;
  filename: string;
  status: string;
  exposure_bias: number | null;
};

export type ReviewGroup = {
  id: string;
  name: string | null;
  confidence_score: number | null;
  review_required: boolean;
  method: string | null;
  reason: string | null;
  items: ReviewItem[];
};

export type Single = { id: string; filename: string; status: string };

const ROLES = ['base_exposure', 'flash', 'ambient', 'drone', 'manual_review'] as const;

function ConfidenceBadge({ score, manual }: { score: number | null; manual: boolean }) {
  if (manual || score == null) return <span className="pill bg-slate-100 text-slate-600">manual</span>;
  const pct = Math.round(score * 100);
  const cls = score >= 0.85 ? 'bg-emerald-100 text-emerald-700' : score >= 0.6 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700';
  return <span className={`pill ${cls}`}>{pct}% confident</span>;
}

export function GroupReviewList({
  jobId,
  groups,
  singles,
}: {
  jobId: string;
  groups: ReviewGroup[];
  singles: Single[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedSingles, setSelectedSingles] = useState<Set<string>>(new Set());

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/re-photo/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Action failed: ${j.error ?? res.status}`);
      } else {
        setSelectedGroups(new Set());
        setSelectedSingles(new Set());
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const needsReview = groups.filter((g) => g.review_required).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">
          Bracket review
          <span className="ml-2 text-sm font-normal text-slate-500">
            {groups.length} groups · {needsReview} need review · {singles.length} singles
          </span>
        </h2>
        <button
          className="btn-secondary"
          disabled={busy || selectedGroups.size < 2}
          onClick={() => act({ action: 'merge', job_id: jobId, group_ids: [...selectedGroups] })}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
          Merge selected ({selectedGroups.size})
        </button>
      </div>

      {groups.length === 0 && singles.length === 0 && (
        <div className="card p-6 text-sm text-slate-500">
          No assets yet. Ingest a folder above to detect brackets.
        </div>
      )}

      {/* Groups */}
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => {
          const selected = selectedGroups.has(g.id);
          const manual = g.confidence_score == null;
          return (
            <div
              key={g.id}
              className={`card p-4 ${g.review_required ? 'ring-1 ring-amber-300' : ''}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(selectedGroups, g.id, setSelectedGroups)}
                  />
                  <span className="font-medium text-slate-900">
                    <Layers className="mr-1 inline h-4 w-4 text-ocean-700" />
                    {g.name ?? 'Bracket'}
                  </span>
                </label>
                <ConfidenceBadge score={g.confidence_score} manual={manual} />
              </div>

              {g.review_required && g.reason && (
                <p className="mb-2 flex items-start gap-1 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {g.reason}
                </p>
              )}

              <ul className="mb-3 divide-y divide-slate-100 rounded-md border border-slate-100">
                {g.items.map((it) => (
                  <li key={it.asset_id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                    <span className={`flex-1 truncate ${it.status === 'rejected' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {it.filename}
                    </span>
                    {it.exposure_bias != null && (
                      <span className="font-mono text-slate-400">{it.exposure_bias > 0 ? '+' : ''}{it.exposure_bias} EV</span>
                    )}
                    <select
                      className="rounded border-slate-200 text-xs"
                      value={it.role ?? ''}
                      disabled={busy}
                      onChange={(e) =>
                        act({ action: 'set_role', group_id: g.id, asset_id: it.asset_id, role: e.target.value })
                      }
                    >
                      <option value="" disabled>role…</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                      ))}
                      <option value="reject">reject</option>
                    </select>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                {g.review_required && (
                  <button
                    className="btn-primary !px-2.5 !py-1.5 text-xs"
                    disabled={busy}
                    onClick={() => act({ action: 'mark_reviewed', group_id: g.id })}
                  >
                    <Check className="h-3.5 w-3.5" /> Mark reviewed
                  </button>
                )}
                <button
                  className="btn-secondary !px-2.5 !py-1.5 text-xs"
                  disabled={busy}
                  onClick={() => act({ action: 'split', group_id: g.id })}
                >
                  <Scissors className="h-3.5 w-3.5" /> Split
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Singles */}
      {singles.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Singles ({singles.length})</h3>
            <button
              className="btn-secondary !px-2.5 !py-1.5 text-xs"
              disabled={busy || selectedSingles.size < 2}
              onClick={() => act({ action: 'create_group', job_id: jobId, asset_ids: [...selectedSingles] })}
            >
              <Layers className="h-3.5 w-3.5" /> Group selected ({selectedSingles.size})
            </button>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {singles.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selectedSingles.has(s.id)}
                  onChange={() => toggle(selectedSingles, s.id, setSelectedSingles)}
                />
                <span className={`truncate ${s.status === 'rejected' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {s.filename}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
