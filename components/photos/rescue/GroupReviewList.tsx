'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitMerge, Scissors, Loader2, AlertTriangle, Layers, Camera, Archive, ArchiveRestore } from 'lucide-react';
import { SCENE_TYPES, sceneBadgeClass } from '@/lib/photos/scene';

export type ReviewItem = {
  asset_id: string;
  role: string | null;
  sort_order: number;
  filename: string;
  status: string;
  exposure_bias: number | null;
  thumb_url: string | null;
  scene: string | null;
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

export type Single = {
  id: string;
  filename: string;
  status: string;
  thumb_url: string | null;
  scene: string | null;
};

const ROLES = ['base_exposure', 'flash', 'ambient', 'drone', 'manual_review'] as const;
const VALID_SINGLE_SET_SIZES = new Set([2, 3, 5, 7]);

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-slate-100 text-slate-300">
        <Camera className="h-4 w-4" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="h-10 w-10 shrink-0 rounded object-cover" />;
}

function SceneBadge({ scene }: { scene: string | null }) {
  if (!scene || scene === 'unknown') return null;
  return <span className={`pill ${sceneBadgeClass(scene)} capitalize`}>{scene}</span>;
}

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
  const [showArchived, setShowArchived] = useState(false);

  // Archived (rejected) singles are hidden from the working view to keep it
  // uncluttered, surfaced on demand behind the "Archived" toggle.
  const activeSingles = singles.filter((s) => s.status !== 'rejected');
  const archivedSingles = singles.filter((s) => s.status === 'rejected');

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await postGroupAction(payload);
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

  async function postGroupAction(payload: Record<string, unknown>) {
    return fetch('/api/re-photo/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function createFixedBrackets(size: 3 | 5 | 7) {
    const ordered = activeSingles.filter((single) => selectedSingles.has(single.id));
    if (ordered.length < size || ordered.length % size !== 0) {
      alert(`Select photos in complete ${size}-shot sets.`);
      return;
    }

    setBusy(true);
    try {
      for (let index = 0; index < ordered.length; index += size) {
        const chunk = ordered.slice(index, index + size);
        const res = await postGroupAction({
          action: 'create_group',
          job_id: jobId,
          asset_ids: chunk.map((single) => single.id),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          alert(`Action failed: ${j.error ?? res.status}`);
          return;
        }
      }
      setSelectedGroups(new Set());
      setSelectedSingles(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setScene(asset_id: string, scene: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/re-photo/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id, scene }),
      });
      if (res.ok) router.refresh();
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
  const oneBracketSelectionIsValid = VALID_SINGLE_SET_SIZES.has(selectedSingles.size);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">
          Bracket sets
          <span className="ml-2 text-sm font-normal text-slate-500">
            {groups.length} sets · {needsReview} need review · {activeSingles.length} ungrouped
          </span>
        </h2>
        <button
          className="btn-secondary"
          disabled={busy || selectedGroups.size < 2}
          onClick={() => act({ action: 'merge', job_id: jobId, group_ids: [...selectedGroups] })}
          title="Use only when auto-detection split one bracket across multiple groups"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
          Combine groups ({selectedGroups.size})
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
                    {g.name ?? 'Bracket set'}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {g.items.length} frames
                    </span>
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
                    <Thumb url={it.thumb_url} alt={it.filename} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate ${it.status === 'rejected' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {it.filename}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {it.exposure_bias != null && (
                          <span className="font-mono text-slate-400">{it.exposure_bias > 0 ? '+' : ''}{it.exposure_bias} EV</span>
                        )}
                        <SceneBadge scene={it.scene} />
                      </span>
                    </div>
                    <select
                      className="rounded border-slate-200 text-xs"
                      value={it.scene ?? 'unknown'}
                      disabled={busy}
                      title="Scene"
                      onChange={(e) => setScene(it.asset_id, e.target.value)}
                    >
                      {SCENE_TYPES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      className="rounded border-slate-200 text-xs"
                      value={it.role ?? ''}
                      disabled={busy}
                      title="Role"
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Ungrouped sources ({activeSingles.length})</h3>
            <div className="flex items-center gap-2">
              {archivedSingles.length > 0 && (
                <button
                  className="btn-secondary !px-2.5 !py-1.5 text-xs"
                  onClick={() => setShowArchived((v) => !v)}
                >
                  <Archive className="h-3.5 w-3.5" />
                  {showArchived ? 'Hide archived' : `Archived (${archivedSingles.length})`}
                </button>
              )}
              <button
                className="btn-secondary !px-2.5 !py-1.5 text-xs"
                disabled={busy || !oneBracketSelectionIsValid}
                onClick={() => act({ action: 'create_group', job_id: jobId, asset_ids: [...selectedSingles] })}
                title="Create one bracket set from 2, 3, 5, or 7 selected frames"
              >
                <Layers className="h-3.5 w-3.5" /> One set ({selectedSingles.size})
              </button>
              <button
                className="btn-primary !px-2.5 !py-1.5 text-xs"
                disabled={busy || selectedSingles.size < 3 || selectedSingles.size % 3 !== 0}
                onClick={() => createFixedBrackets(3)}
              >
                <Layers className="h-3.5 w-3.5" /> 3-frame sets ({selectedSingles.size})
              </button>
            </div>
          </div>

          {activeSingles.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeSingles.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedSingles.has(s.id)}
                    onChange={() => toggle(selectedSingles, s.id, setSelectedSingles)}
                  />
                  <Thumb url={s.thumb_url} alt={s.filename} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-slate-700">{s.filename}</span>
                    <SceneBadge scene={s.scene} />
                  </div>
                  <select
                    className="rounded border-slate-200 text-xs"
                    value={s.scene ?? 'unknown'}
                    disabled={busy}
                    title="Scene"
                    onChange={(e) => setScene(s.id, e.target.value)}
                  >
                    {SCENE_TYPES.map((sc) => (
                      <option key={sc} value={sc}>{sc}</option>
                    ))}
                  </select>
                  <button
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
                    title="Archive"
                    disabled={busy}
                    onClick={() => act({ action: 'reject_asset', asset_id: s.id })}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No active singles.</p>
          )}

          {showArchived && archivedSingles.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Archived</h4>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {archivedSingles.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs opacity-70">
                    <Thumb url={s.thumb_url} alt={s.filename} />
                    <span className="min-w-0 flex-1 truncate text-slate-500 line-through">{s.filename}</span>
                    <button
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ocean-700 disabled:opacity-50"
                      title="Unarchive"
                      disabled={busy}
                      onClick={() => act({ action: 'restore_asset', asset_id: s.id })}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
