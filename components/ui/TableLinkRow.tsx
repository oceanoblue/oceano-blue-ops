'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * A clickable table row that navigates to `href` (with hover prefetch), used by
 * DataTable when a row is given an href. Kept as a tiny client component so
 * DataTable itself can stay a server component and call its cell renderers
 * server-side. `children` are the already-rendered <td> cells.
 */
export function TableLinkRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      onMouseEnter={() => router.prefetch(href)}
      className="hover:bg-slate-50 cursor-pointer transition"
    >
      {children}
    </tr>
  );
}
