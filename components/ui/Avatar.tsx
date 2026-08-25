/**
 * Deterministic initials avatar — the same name always gets the same color, so
 * an agent reads as "their" chip across the app without needing an uploaded
 * logo. Pure/server-renderable.
 */
const PALETTE: [string, string][] = [
  ['bg-rose-100', 'text-rose-700'],
  ['bg-amber-100', 'text-amber-700'],
  ['bg-emerald-100', 'text-emerald-700'],
  ['bg-teal-100', 'text-teal-700'],
  ['bg-sky-100', 'text-sky-700'],
  ['bg-indigo-100', 'text-indigo-700'],
  ['bg-violet-100', 'text-violet-700'],
  ['bg-fuchsia-100', 'text-fuchsia-700'],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name?: string | null): string {
  if (!name) return '–';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '–';
  const a = parts[0][0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (a + b).toUpperCase();
}

export function Avatar({
  name,
  size = 'sm',
  className = '',
}: {
  name?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [bg, fg] = PALETTE[hash(name ?? '') % PALETTE.length];
  const dim = size === 'md' ? 'h-9 w-9 text-[13px]' : 'h-7 w-7 text-[11px]';
  return (
    <span
      className={`inline-grid ${dim} shrink-0 place-items-center rounded-full font-semibold ${bg} ${fg} ${className}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
