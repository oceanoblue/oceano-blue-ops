'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, X, Pencil, Plus } from 'lucide-react';

/** Inline phone editor for a team member row. Admin-only PATCH to /api/team/[id].
 *  Used for SMS notifications (assignment / accept-decline / shoot-logged). */
export function TeamMemberPhone({
  memberId,
  initialPhone,
  editable,
}: {
  memberId: string;
  initialPhone: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialPhone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    return <span className="text-slate-600">{phone || <span className="text-slate-400">—</span>}</span>;
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: draft }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || `Failed (${r.status})`);
      setPhone(draft.trim());
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          className="input h-8 w-40 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="(843) 555-1234"
          inputMode="tel"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button
          onClick={save}
          disabled={busy}
          className="grid h-8 w-8 place-items-center rounded-md bg-ocean-600 text-white hover:bg-ocean-700 disabled:opacity-50"
          title="Save"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          onClick={() => {
            setDraft(phone);
            setEditing(false);
            setError(null);
          }}
          className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(phone);
        setEditing(true);
      }}
      className="group inline-flex items-center gap-1.5 text-slate-600 hover:text-ocean-700"
    >
      {phone ? (
        <>
          <span>{phone}</span>
          <Pencil className="h-3.5 w-3.5 text-slate-300 group-hover:text-ocean-600" />
        </>
      ) : (
        <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-ocean-600">
          <Plus className="h-3.5 w-3.5" /> Add phone
        </span>
      )}
    </button>
  );
}
