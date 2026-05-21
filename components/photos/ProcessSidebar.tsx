'use client';

import { Loader2, Sparkles, Wand2, Sun, Square, Trees, MoonStar, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type EditKind =
  | 'hdr_merge'
  | 'enhance_single'
  | 'sky_replace'
  | 'window_pull'
  | 'lawn_enhance'
  | 'twilight_convert'
  | 'declutter';

export type ProviderId = 'auto' | 'oceano-enhance' | 'autoenhance' | 'openai-gpt-image' | 'gemini-banana-pro';

/**
 * Sticky right-side panel that owns the "what to do with the selected photos"
 * controls. Lives next to the photo grid so the photographer can keep scrolling
 * through their shoot while seeing live selection count + cost estimate.
 */
interface ProcessSidebarProps {
  bracketCount: number;
  singleCount: number;
  selectedBracketCount: number;
  selectedSingleCount: number;
  edits: Set<EditKind>;
  onEditsChange: (next: Set<EditKind>) => void;
  provider: ProviderId;
  onProviderChange: (p: ProviderId) => void;
  running: boolean;
  onRun: () => void;
  /** Optional batch progress to show inside the sidebar. */
  progress?: { done: number; total: number } | null;
  error?: string | null;
}

interface EditOption {
  id: EditKind;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Whether this edit type applies to brackets (HDR merge) or singles. */
  appliesTo: 'brackets' | 'singles' | 'both';
}

const EDIT_OPTIONS: EditOption[] = [
  { id: 'hdr_merge', label: 'HDR merge brackets', hint: 'Combine 3/5/7-shot exposures', icon: Sparkles, appliesTo: 'brackets' },
  { id: 'enhance_single', label: 'Smart enhance', hint: 'WB, shadows, highlights, vibrance', icon: Wand2, appliesTo: 'singles' },
  { id: 'sky_replace', label: 'Sky replacement', hint: 'Replace dull skies on exteriors', icon: Sun, appliesTo: 'both' },
  { id: 'window_pull', label: 'Window pull', hint: 'Recover blown windows on interiors', icon: Square, appliesTo: 'both' },
  { id: 'lawn_enhance', label: 'Lawn enhance', hint: 'Make patchy grass look healthy', icon: Trees, appliesTo: 'both' },
  { id: 'twilight_convert', label: 'Twilight convert', hint: 'Daytime exterior → twilight', icon: MoonStar, appliesTo: 'both' },
  { id: 'declutter', label: 'Light declutter', hint: 'Remove small personal items', icon: Trash2, appliesTo: 'both' },
];

// Rough per-photo cost in cents for budget display. Real costs depend on
// provider and what actually runs — this is just a planning number.
const COST_PER_EDIT_CENTS: Record<EditKind, number> = {
  hdr_merge: 0, // free on Oceano Enhance
  enhance_single: 0, // free on Oceano (vision analyzer adds < 1¢)
  sky_replace: 12, // GPT Image 2
  window_pull: 13, // Nano Banana Pro
  lawn_enhance: 0, // free on Oceano
  twilight_convert: 12,
  declutter: 12,
};

export function ProcessSidebar({
  bracketCount,
  singleCount,
  selectedBracketCount,
  selectedSingleCount,
  edits,
  onEditsChange,
  provider,
  onProviderChange,
  running,
  onRun,
  progress,
  error,
}: ProcessSidebarProps) {
  function toggle(edit: EditKind) {
    const next = new Set(edits);
    if (next.has(edit)) next.delete(edit);
    else next.add(edit);
    onEditsChange(next);
  }

  const totalSelected = selectedBracketCount + selectedSingleCount;
  const hasEdits = edits.size > 0;
  const canRun = !running && totalSelected > 0 && hasEdits;

  // Estimate cost = sum of (per-edit cost × applicable selected count)
  let estCents = 0;
  for (const e of edits) {
    const opt = EDIT_OPTIONS.find((o) => o.id === e);
    if (!opt) continue;
    const applicable =
      opt.appliesTo === 'brackets'
        ? selectedBracketCount
        : opt.appliesTo === 'singles'
        ? selectedSingleCount
        : totalSelected;
    estCents += COST_PER_EDIT_CENTS[e] * applicable;
  }

  return (
    <aside className="card p-5 lg:sticky lg:top-4 self-start">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-ocean-900">Process selected</h3>
        <span className="text-xs text-slate-500">
          {totalSelected}/{bracketCount + singleCount}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {selectedBracketCount > 0 && `${selectedBracketCount} bracket${selectedBracketCount === 1 ? '' : 's'}`}
        {selectedBracketCount > 0 && selectedSingleCount > 0 && ' · '}
        {selectedSingleCount > 0 && `${selectedSingleCount} single${selectedSingleCount === 1 ? '' : 's'}`}
        {totalSelected === 0 && 'Select photos to begin'}
      </p>

      {progress && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>Processing</span>
            <span>
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-ocean-600 transition-all"
              style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">What to do</div>
        <div className="space-y-1.5">
          {EDIT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const checked = edits.has(opt.id);
            const dim =
              (opt.appliesTo === 'brackets' && selectedBracketCount === 0) ||
              (opt.appliesTo === 'singles' && selectedSingleCount === 0);
            return (
              <label
                key={opt.id}
                className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 cursor-pointer transition ${
                  checked ? 'bg-ocean-50' : 'hover:bg-slate-50'
                } ${dim ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-3.5 w-3.5 rounded accent-ocean-600"
                  checked={checked}
                  onChange={() => toggle(opt.id)}
                />
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${checked ? 'text-ocean-700' : 'text-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${checked ? 'text-ocean-900' : 'text-slate-700'}`}>
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight">{opt.hint}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Provider
        </label>
        <select
          className="input mt-1"
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as ProviderId)}
        >
          <option value="auto">Auto (Smart Enhance)</option>
          <option value="oceano-enhance">Oceano Enhance (no AI)</option>
          <option value="autoenhance">Autoenhance.ai</option>
          <option value="openai-gpt-image">GPT Image 2</option>
          <option value="gemini-banana-pro">Nano Banana Pro</option>
        </select>
      </div>

      {estCents > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">Est. cost</span>
          <span className="font-mono font-medium text-slate-900">
            ${(estCents / 100).toFixed(2)}
          </span>
        </div>
      )}

      <button
        className="btn-primary mt-5 w-full justify-center"
        disabled={!canRun}
        onClick={onRun}
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        {running
          ? 'Processing…'
          : totalSelected === 0
          ? 'Select photos first'
          : !hasEdits
          ? 'Pick an edit'
          : `Process ${totalSelected} ${totalSelected === 1 ? 'photo' : 'photos'}`}
      </button>

      {error && (
        <p className="mt-3 text-xs text-rose-700 bg-rose-50 rounded px-2 py-1.5">{error}</p>
      )}

      <p className="mt-4 text-[11px] text-slate-400 leading-tight">
        Dimmed edits don't apply to the current selection. Provider Auto picks
        the cheapest option that does each job well — Oceano Enhance for
        deterministic edits, generation models for sky/window/twilight.
      </p>
    </aside>
  );
}
