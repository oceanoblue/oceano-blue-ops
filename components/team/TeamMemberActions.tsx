'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, RotateCcw } from 'lucide-react';

/** Remove (delete if no history, else deactivate) / restore a team member.
 *  Admin-only; admins and yourself are protected server-side. */
export function TeamMemberActions({
  memberId,
  role,
  isActive,
  isSelf,
  editable,
}: {
  memberId: string;
  role: string;
  isActive: boolean;
  isSelf: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!editable) return null;
  if (isSelf) return <span className="text-xs text-slate-400">You</span>;
  if (role === 'admin' && isActive) return <span className="text-xs text-slate-400">Protected</span>;

  async function setActive(active: boolean) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await fetch(`/api/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || `Failed (${r.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove this team member? If they have order history they’ll be deactivated (records kept) instead of deleted.')) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await fetch(`/api/team/${memberId}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        router.refresh();
        return;
      }
      // Has history → deactivate instead (records stay).
      if (d.code === 'has_history') {
        const r2 = await fetch(`/api/team/${memberId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        });
        const d2 = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(d2.message || d2.error || `Failed (${r2.status})`);
        setNote('Had history — deactivated instead (records kept).');
        router.refresh();
        return;
      }
      throw new Error(d.message || d.error || `Failed (${r.status})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {isActive ? (
        <button
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm text-rose-600 transition hover:text-rose-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Remove
        </button>
      ) : (
        <button
          onClick={() => setActive(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm text-ocean-700 transition hover:text-ocean-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Restore
        </button>
      )}
      {note && <span className="max-w-[14rem] text-xs text-slate-500">{note}</span>}
      {error && <span className="max-w-[14rem] text-xs text-rose-600">{error}</span>}
    </div>
  );
}
