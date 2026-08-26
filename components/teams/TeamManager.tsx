'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, UserPlus, Check } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

interface Client { id: string; full_name: string; email: string }
interface Member { id: string; role: string; notify_on_delivery: boolean; client: Client | null }
interface Team { id: string; name: string; brokerage: string | null; notes: string | null }

export function TeamManager({ team, members, clients }: { team: Team; members: Member[]; clients: Client[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // key of in-flight action
  const [err, setErr] = useState<string | null>(null);

  const memberClientIds = useMemo(() => new Set(members.map((m) => m.client?.id).filter(Boolean)), [members]);
  const available = clients.filter((c) => !memberClientIds.has(c.id));

  async function call(url: string, method: string, body?: unknown, key = url) {
    setBusy(key);
    setErr(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? `error_${res.status}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? 'failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {err && <p className="rounded-md bg-rose-50 p-2.5 text-sm text-rose-700">{err}</p>}

      <TeamDetails team={team} onSave={(patch) => call(`/api/client-teams/${team.id}`, 'PATCH', patch, 'details')} saving={busy === 'details'} />

      {/* Members */}
      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ocean-900">Members</h2>
          <span className="text-xs text-slate-500">{members.length} on this team</span>
        </div>

        <AddMember
          available={available}
          adding={busy === 'add'}
          onAdd={(client_id) => call(`/api/client-teams/${team.id}/members`, 'POST', { client_id }, 'add')}
        />

        <div className="mt-4 divide-y divide-slate-100">
          {members.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No members yet — add an agent or coordinator above.</p>}
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <Avatar name={m.client?.full_name || m.client?.email || '?'} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink-900">{m.client?.full_name || '—'}</div>
                <div className="truncate text-xs text-slate-500">{m.client?.email}</div>
              </div>

              <select
                className="input h-9 w-28 py-1 text-sm"
                value={m.role}
                onChange={(e) => call(`/api/client-teams/${team.id}/members`, 'PATCH', { member_id: m.id, role: e.target.value }, m.id)}
                disabled={busy === m.id}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>

              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={m.notify_on_delivery}
                  onChange={(e) => call(`/api/client-teams/${team.id}/members`, 'PATCH', { member_id: m.id, notify_on_delivery: e.target.checked }, m.id)}
                  disabled={busy === m.id}
                  className="h-4 w-4 rounded border-slate-300 text-ocean-600"
                />
                Delivery emails
              </label>

              <button
                onClick={() => call(`/api/client-teams/${team.id}/members?member_id=${m.id}`, 'DELETE', undefined, m.id)}
                disabled={busy === m.id}
                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove member"
              >
                {busy === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamDetails({ team, onSave, saving }: { team: Team; onSave: (patch: { name: string; brokerage: string; notes: string }) => void; saving: boolean }) {
  const [f, setF] = useState({ name: team.name, brokerage: team.brokerage ?? '', notes: team.notes ?? '' });
  const dirty = f.name !== team.name || f.brokerage !== (team.brokerage ?? '') || f.notes !== (team.notes ?? '');
  return (
    <section className="card space-y-3 p-6">
      <h2 className="text-sm font-semibold text-ocean-900">Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Team name</label>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Brokerage</label>
          <input className="input" value={f.brokerage} onChange={(e) => setF({ ...f, brokerage: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Anything the team needs handled a certain way…" />
      </div>
      <div className="flex justify-end">
        <button className="btn-primary text-sm" onClick={() => onSave(f)} disabled={saving || !dirty || !f.name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
        </button>
      </div>
    </section>
  );
}

function AddMember({ available, onAdd, adding }: { available: Client[]; onAdd: (clientId: string) => void; adding: boolean }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState('');
  const filtered = available.filter((c) => `${c.full_name} ${c.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Search clients to add…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPick(''); }}
        />
        <button
          className="btn-primary shrink-0 text-sm"
          disabled={adding || !pick}
          onClick={() => { if (pick) { onAdd(pick); setQ(''); setPick(''); } }}
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
        </button>
      </div>
      {q && (
        <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-slate-100">
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No matching clients.</p>}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { setPick(c.id); setQ(c.full_name); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 ${pick === c.id ? 'bg-ocean-50/60' : ''}`}
            >
              <Avatar name={c.full_name || c.email} />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-900">{c.full_name}</span>
                <span className="block truncate text-xs text-slate-500">{c.email}</span>
              </span>
              {pick === c.id && <Check className="ml-auto h-4 w-4 text-ocean-600" />}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Only existing clients appear here. Need a new person? Add them on the <a href="/dashboard/clients" className="text-ocean-700 hover:underline">Clients</a> page first — they&apos;ll get their own login.
      </p>
    </div>
  );
}
