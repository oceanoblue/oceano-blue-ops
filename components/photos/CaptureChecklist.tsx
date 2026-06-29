'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ListChecks, Star } from 'lucide-react';
import { checklistFor, checklistItemCount } from '@/lib/photos/capture-checklists';
import { profileFor } from '@/lib/photos/profiles';

/**
 * On-order capture guidance for the shoot's production profile. The ticks are a
 * convenience for the photographer in the field — persisted to localStorage per
 * order+profile (no server round-trip; resets cleanly if the profile changes).
 */
export function CaptureChecklist({
  orderId,
  projectType,
}: {
  orderId: string;
  projectType: string | null | undefined;
}) {
  const profile = profileFor(projectType);
  const sections = useMemo(() => checklistFor(projectType), [projectType]);
  const total = useMemo(() => checklistItemCount(sections), [sections]);
  const storageKey = `obm:capture:${orderId}:${profile.id}`;

  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Load saved ticks for this order+profile.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setChecked(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch {
      setChecked(new Set());
    }
  }, [storageKey]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* storage unavailable — ticks just won't persist */
      }
      return next;
    });
  }

  const done = checked.size;

  return (
    <div className="mb-4 rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <ListChecks className="h-4 w-4 text-ocean-600" />
          Capture checklist
          <span className="text-xs font-normal text-slate-400">· {profile.label}</span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`pill ${
              done >= total && total > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {done}/{total}
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          {sections.map((section, si) => (
            <div key={section.title}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {section.title}
              </div>
              <ul className="space-y-1">
                {section.items.map((item, ii) => {
                  const key = `${si}:${ii}`;
                  const isChecked = checked.has(key);
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(key)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-ocean-600 focus:ring-ocean-500"
                        />
                        <span className={isChecked ? 'text-slate-400 line-through' : 'text-slate-700'}>
                          {item.text}
                          {item.critical && (
                            <Star
                              className="ml-1 inline h-3 w-3 -translate-y-px fill-amber-400 text-amber-400"
                              aria-label="critical"
                            />
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">
            <Star className="mr-1 inline h-3 w-3 -translate-y-px fill-amber-400 text-amber-400" /> = critical for this
            profile. Ticks save on this device only.
          </p>
        </div>
      )}
    </div>
  );
}
