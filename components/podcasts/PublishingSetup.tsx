'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Youtube, CheckCircle2 } from 'lucide-react';

type Connection = { id: number; label: string };

/**
 * Guided Phase-C setup: pick the client's YouTube connection (listed live from
 * Make) and one-click add this show to the publish Router. Append-only + only
 * acts on click — never touches live scenarios silently.
 */
export function PublishingSetup({
  showId,
  provisioned,
  currentConnectionId,
}: {
  showId: string;
  provisioned: boolean;
  currentConnectionId: string | null;
}) {
  const router = useRouter();
  const [conns, setConns] = useState<Connection[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [selected, setSelected] = useState<string>(currentConnectionId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/podcasts/make/connections')
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured !== false);
        setConns(d.connections ?? []);
      })
      .catch(() => setConns([]));
  }, []);

  async function provision() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/podcasts/shows/provision-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: showId, connection_id: Number(selected) }),
      });
      const json = await res.json().catch(() => ({}));
      const status = json.result?.status;
      if (status === 'created') setMsg({ kind: 'ok', text: 'Added to the publish Router — this show will publish on its own YouTube account.' });
      else if (status === 'exists') setMsg({ kind: 'ok', text: 'Already wired in the publish Router. Connection saved.' });
      else if (status === 'no_router') setMsg({ kind: 'err', text: 'The publish scenario has no Router yet — add one first (or ask me to).' });
      else if (status === 'not_configured') setMsg({ kind: 'err', text: 'Make API not configured (MAKE_API_TOKEN).' });
      else setMsg({ kind: 'err', text: `Failed: ${json.result?.error ?? res.status}` });
      if (status === 'created' || status === 'exists') router.refresh();
    } catch {
      setMsg({ kind: 'err', text: 'Failed: network error' });
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Publishing setup</h2>
        <p className="text-sm text-slate-500">
          Connect the Make API (set <code className="font-mono">MAKE_API_TOKEN</code>) to auto-wire this show’s YouTube routing.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Publishing setup</h2>
        {provisioned && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Routed
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-600">
        Pick this client’s YouTube account, then add it to the publish Router. First connect the account in Make
        (one-time sign-in), then it appears below.
      </p>
      {msg && (
        <div
          className={`mb-3 rounded-md border p-3 text-sm ${msg.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}
          role={msg.kind === 'ok' ? 'status' : 'alert'}
        >
          {msg.text}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <label className="label">YouTube connection</label>
          <select className="input" value={selected} disabled={busy || conns === null} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{conns === null ? 'Loading…' : '— pick the client’s YouTube —'}</option>
            {(conns ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={busy || !selected} onClick={provision}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
          Add to publish Router
        </button>
      </div>
      {conns !== null && conns.length === 0 && (
        <p className="mt-2 text-xs text-slate-400">
          No YouTube connections found in Make yet — sign into the client’s channel in Make, then refresh.
        </p>
      )}
    </section>
  );
}
