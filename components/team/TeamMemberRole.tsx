'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const ROLES = ['admin', 'coordinator', 'photographer', 'editor'] as const;
const LABEL: Record<string, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  photographer: 'Photographer',
  editor: 'Editor',
};

/** Inline role editor (admin-only) → PATCH /api/team/[id]. Surfaces the
 *  last-admin guard from the API. */
export function TeamMemberRole({
  memberId,
  role,
  editable,
}: {
  memberId: string;
  role: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) return <span className="text-slate-600">{LABEL[role] ?? role}</span>;

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || `Failed (${r.status})`);
      router.refresh();
    } catch (e) {
      setValue(prev); // revert on failure (e.g. last-admin guard)
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="input h-8 w-36 py-1 text-sm"
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {LABEL[r]}
          </option>
        ))}
      </select>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      {error && <span className="max-w-[12rem] text-xs text-rose-600">{error}</span>}
    </div>
  );
}
