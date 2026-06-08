'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, Copy } from 'lucide-react';

/**
 * Registers a local worker and reveals the generated API key exactly once.
 * The key is never stored in plaintext server-side, so it must be copied now.
 */
export function RegisterWorkerButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null);

  async function register() {
    const name = window.prompt('Worker name (e.g. "Studio iMac" or "Office NAS"):');
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/worker/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Could not register: ${json.error ?? res.status}`);
        return;
      }
      setIssued({ name, key: json.api_key });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <button className="btn-primary" disabled={busy} onClick={register}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Register worker
      </button>

      {issued && (
        <div className="card w-full max-w-xl border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">
            API key for “{issued.name}” — copy it now, it won’t be shown again
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs ring-1 ring-amber-200">{issued.key}</code>
            <button
              className="btn-secondary !px-2 !py-1 text-xs"
              onClick={() => navigator.clipboard?.writeText(issued.key)}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-amber-800">
            Set this as <code>WORKER_API_KEY</code> in the local worker’s environment. Dismiss by
            refreshing once you’ve stored it.
          </p>
        </div>
      )}
    </div>
  );
}
