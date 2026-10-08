'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { PreparedPhotoDownload } from './PreparedPhotoDownload';

export type DeliverySize = 'full' | 'print' | 'web';
export function photoDownloadUrl(token: string, size: DeliverySize): string {
  return `/api/delivery/${encodeURIComponent(token)}/download${size === 'full' ? '' : `?size=${size}`}`;
}

type Props = { token?: string; endpoint?: string; photoCount: number; demo?: boolean };

/** Both choices stay visible on mobile. Each choice downloads one complete ZIP. */
export function PhotoDownloadControls({ token, endpoint, photoCount, demo = false }: Props) {
  const options = [
    { size: 'web' as const, label: 'Web / MLS · Low resolution', hint: 'Recommended for listings and web. JPEGs up to 2048 px, under 2 MB each.' },
    { size: 'full' as const, label: 'High resolution', hint: 'Original delivered files for print and archiving. Larger file sizes.' },
  ];
  return <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
    {options.map(option => {
      const href = endpoint ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}size=${option.size}` : photoDownloadUrl(token!, option.size);
      return <div key={option.size} className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-ocean-950">{option.label}</p>
        <p className="text-xs leading-relaxed text-slate-500">{option.hint}</p>
        {demo ? <button type="button" className="btn-primary min-h-11 w-full" disabled title="Sample gallery: downloads disabled">
          <Download className="h-4 w-4" /> Download {option.size === 'web' ? 'Web / MLS' : 'High-res'} ZIP
        </button> : <PreparedPhotoDownload photoCount={photoCount}>
          <a href={href} className="btn-primary min-h-11 w-full" download>
            <Download className="h-4 w-4 shrink-0" /> Download {option.size === 'web' ? 'Web / MLS' : 'High-res'} ZIP
          </a>
        </PreparedPhotoDownload>}
        <p className="text-xs text-slate-500">All {photoCount} photos · One ZIP file</p>
      </div>;
    })}
  </div>;
}
