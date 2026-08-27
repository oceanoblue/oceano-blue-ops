'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Check, X } from 'lucide-react';

const DAYS = [
  { i: 0, label: 'Sun' },
  { i: 1, label: 'Mon' },
  { i: 2, label: 'Tue' },
  { i: 3, label: 'Wed' },
  { i: 4, label: 'Thu' },
  { i: 5, label: 'Fri' },
  { i: 6, label: 'Sat' },
];

const ROLES = ['photographer', 'editor', 'coordinator', 'admin'] as const;

/**
 * Add a team member. Posts to /api/team, which creates the auth user +
 * team_members row + the chosen availability. Availability is set here up front
 * so the new person is schedulable immediately (no rows = the scheduler never
 * picks them).
 */
export function NewTeamMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({ full_name: '', email: '', phone: '', role: 'photographer' as (typeof ROLES)[number] });
  // Availability: a set of active weekdays (default Mon–Fri) sharing one time window.
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');

  function toggleDay(i: number) {
    setDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (end <= start) {
      setError('End time must be after start time.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const availability = days.map((d) => ({ day_of_week: d, start_local: start, end_local: end }));
      const r = await fetch('/api/team', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: f.full_name,
          email: f.email,
          phone: f.phone || undefined,
          role: f.role,
          availability,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || `Failed (${r.status})`);
      setF({ full_name: '', email: '', phone: '', role: 'photographer' });
      setDays([1, 2, 3, 4, 5]);
      setStart('09:00');
      setEnd('17:00');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-1.5">
        <UserPlus className="h-4 w-4" /> Add team member
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ocean-900">New team member</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Full name <span className="text-rose-600">*</span></label>
          <input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required autoFocus />
        </div>
        <div>
          <label className="label">Email (their sign-in) <span className="text-rose-600">*</span></label>
          <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as (typeof ROLES)[number] })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Weekly availability</label>
        <p className="mb-2 text-xs text-slate-500">
          Sets when the scheduler can book them. Without any days they’re never auto-assigned — you can fine-tune this later in Settings → Availability.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = days.includes(d.i);
            return (
              <button
                key={d.i}
                type="button"
                onClick={() => toggleDay(d.i)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  on ? 'bg-ocean-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div>
            <label className="label">From</label>
            <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">{error}</p>}

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <button
          type="submit"
          disabled={busy || !f.full_name.trim() || !f.email.trim()}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Add member
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
        <span className="text-xs text-slate-400">No email is sent — they sign in with the magic link when you’re ready.</span>
      </div>
    </form>
  );
}
