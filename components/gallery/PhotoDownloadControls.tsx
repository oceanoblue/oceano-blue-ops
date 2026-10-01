'use client';

import * as React from 'react';
import { ChevronDown, Download } from 'lucide-react';

export type DeliverySize = 'full' | 'print' | 'web';

const SIZE_OPTIONS: { value: DeliverySize; label: string; hint: string }[] = [
  { value: 'full', label: 'Full resolution', hint: 'Original delivered files, unchanged.' },
  { value: 'print', label: 'Print resolution', hint: 'JPEGs up to 3000 px on the longest side, for print.' },
  { value: 'web', label: 'Web resolution', hint: 'JPEGs up to 2048 px on the longest side, for MLS and web.' },
];

export function photoDownloadUrl(token: string, size: DeliverySize): string {
  return `/api/delivery/${encodeURIComponent(token)}/download${size === 'full' ? '' : `?size=${size}`}`;
}

type Props = {
  token: string;
  photoCount: number;
  value: DeliverySize;
  onChange: (size: DeliverySize) => void;
  demo?: boolean;
};

/** Render only for unlocked galleries. Let the browser manage the native picker:
 * a timed blur-close can remove a custom menu before a touch/click completes,
 * and an absolutely positioned menu can extend outside a narrow viewport. */
export function PhotoDownloadControls({ token, photoCount, value, onChange, demo = false }: Props) {
  const selected = SIZE_OPTIONS.find(option => option.value === value) ?? SIZE_OPTIONS[0];
  return (
    <div className="max-w-full space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 max-w-full">
          <span className="mb-1 block text-xs font-medium text-slate-600">Download resolution</span>
          <span className="relative block">
            <select
              name="download-resolution"
              value={value}
              onChange={event => {
                const next = event.currentTarget.value;
                if (next === 'full' || next === 'print' || next === 'web') onChange(next);
              }}
              aria-describedby="photo-download-resolution-help"
              className="min-h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-base font-medium text-ocean-950 shadow-sm focus:border-ocean-500 focus:outline-none focus:ring-2 focus:ring-ocean-500/20 sm:text-sm"
            >
              {SIZE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ocean-700" />
          </span>
        </label>
        {demo ? (
          <button type="button" className="btn-primary min-h-11" disabled title="Sample gallery: downloads disabled">
            <Download className="h-4 w-4" /> Download all ({photoCount})
          </button>
        ) : (
          <a href={photoDownloadUrl(token, value)} className="btn-primary min-h-11" download title={selected.hint}>
            <Download className="h-4 w-4" /> Download all ({photoCount})
          </a>
        )}
      </div>
      <p id="photo-download-resolution-help" aria-live="polite" className="max-w-sm text-xs leading-relaxed text-slate-500">
        {selected.hint} Applies to Download all; gallery previews stay the same.
      </p>
    </div>
  );
}
