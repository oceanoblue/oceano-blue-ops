import { Film, Download } from 'lucide-react';

export interface FootageView {
  id: string;
  filename: string;
  role: string | null;
  notes: string | null;
  byte_size: number | null;
  duration_seconds: number | null;
  url: string | null;
}

function fmtBytes(n: number | null) {
  if (!n) return '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDur(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Read-only footage grid for the ops order view. URLs are pre-signed server-side. */
export function ReelFootageList({ items }: { items: FootageView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No footage uploaded yet.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map((f) => (
        <li key={f.id} className="overflow-hidden rounded-xl border border-slate-200">
          {f.url ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={f.url} controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
          ) : (
            <div className="grid aspect-video w-full place-items-center bg-slate-100 text-slate-400">
              <Film className="h-7 w-7" />
            </div>
          )}
          <div className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ocean-950">{f.filename}</div>
                <div className="text-xs text-slate-500">
                  {fmtBytes(f.byte_size)}
                  {fmtDur(f.duration_seconds) ? ` · ${fmtDur(f.duration_seconds)}` : ''}
                  {f.role ? ` · ${f.role}` : ''}
                </div>
              </div>
              {f.url && (
                <a
                  href={f.url}
                  download
                  className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-ocean-700"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
            </div>
            {f.notes && <p className="mt-1.5 text-xs text-slate-600">{f.notes}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
