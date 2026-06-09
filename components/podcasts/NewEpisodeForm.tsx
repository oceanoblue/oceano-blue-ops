'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

/** Plan an episode for a show ahead of recording (record-keeping only). */
export function NewEpisodeForm({ showId }: { showId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/podcasts/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          show_id: showId,
          title,
          episode_number: number ? Number(number) : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`Failed: ${json.error ?? res.status}`);
        return;
      }
      setTitle('');
      setNumber('');
      router.refresh();
    } catch {
      setError('Failed: network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Plan an episode</label>
          <input className="input" required value={title} disabled={busy} placeholder="Episode title" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="w-20">
          <label className="label">Ep #</label>
          <input className="input" type="number" min="1" value={number} disabled={busy} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <button type="submit" className="btn-secondary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>
    </form>
  );
}
