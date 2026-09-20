'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type GalleryRevisionRow = { id: string; order_id: string; note: string; status: string; staff_response: string; photos: { filename: string } | null; orders: { order_number: number } | null };
function RevisionRow({ row }: { row: GalleryRevisionRow }) {
  const router = useRouter();
  const [status, setStatus] = useState(row.status);
  const [reply, setReply] = useState(row.staff_response);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const response = await fetch(`/api/gallery-revisions/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, staff_response: reply }) });
      if (!response.ok) throw new Error('Could not save changes.');
      router.refresh();
    } catch { setError('Could not save changes. Please retry.'); }
    finally { setBusy(false); }
  }
  return <li className="rounded-xl border border-slate-200 bg-white p-5">
    <Link href={`/dashboard/orders/${row.order_id}`} className="font-medium text-ocean-700">Order #{row.orders?.order_number ?? '—'} · {row.photos?.filename ?? 'Photo'}</Link>
    <p className="my-3 whitespace-pre-wrap text-sm text-slate-700">{row.note}</p>
    <form onSubmit={save} className="grid gap-3">
      <label className="text-sm">Status<select className="input ml-3" value={status} onChange={e => setStatus(e.target.value)} disabled={busy}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label>
      <label className="text-sm">Reply shown to client<textarea className="input mt-1 w-full" maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} disabled={busy} /></label>
      <button className="btn-primary justify-self-start" disabled={busy}>{busy ? 'Saving…' : 'Save update'}</button>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
  </li>;
}
export function GalleryRevisionQueue({ rows, error }: { rows: GalleryRevisionRow[]; error?: boolean }) {
  return <section><h2 className="mb-3 text-lg font-semibold">Client photo requests</h2>{error ? <p className="text-sm text-rose-700">Unable to load client requests. Refresh to retry.</p> : rows.length ? <ul className="space-y-4">{rows.map(row => <RevisionRow key={row.id} row={row} />)}</ul> : <p className="text-sm text-slate-500">No photo revision requests yet.</p>}</section>;
}
