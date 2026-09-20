'use client';
import { useCallback, useEffect, useState } from 'react';

type Revision = { id: string; photo_id: string; note: string; status: string; staff_response: string; created_at: string };
export function RevisionRequests({ token, photos, selectedPhoto, demo = false }: {
  token: string; photos: { id: string; filename: string }[]; selectedPhoto?: string; demo?: boolean;
}) {
  const [requests, setRequests] = useState<Revision[]>([]);
  const [photoId, setPhotoId] = useState(selectedPhoto || photos[0]?.id || '');
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    if (demo) return;
    try {
      const response = await fetch(`/api/delivery/${token}/revisions`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setRequests((await response.json()).requests);
      setError('');
    } catch { setError('Unable to load requests. Please refresh or contact us.'); }
  }, [token, demo]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedPhoto) { setPhotoId(selectedPhoto); setRequestId(''); } }, [selectedPhoto]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (demo || busy) return;
    setBusy(true); setError(''); setMessage('');
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    try {
      const response = await fetch(`/api/delivery/${token}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, photo_id: photoId, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save request.');
      setRequests(current => [data.request, ...current.filter(r => r.id !== id)]);
      setNote(''); setRequestId(''); setMessage('Request saved. Our team will review it.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save request. Please retry.'); }
    finally { setBusy(false); }
  }
  return <section id="gallery-requests" className="mt-10 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Photo revision requests</h2><button type="button" className="text-sm text-ocean-700 underline" onClick={load} disabled={demo}>Refresh status</button></div>
    <p className="mt-1 text-sm text-slate-600">Choose a photo and tell us what needs changing. Replies and progress appear here.</p>
    {photos.length > 0 && <form onSubmit={submit} className="mt-4 grid gap-3">
      <label className="text-sm font-medium">Photo<select className="input mt-1 w-full" value={photoId} onChange={e => { setPhotoId(e.target.value); setRequestId(''); }} disabled={busy}>{photos.map(p => <option key={p.id} value={p.id}>{p.filename}</option>)}</select></label>
      <label className="text-sm font-medium">What would you like changed?<textarea className="input mt-1 min-h-24 w-full" required maxLength={2000} value={note} onChange={e => { setNote(e.target.value); setRequestId(''); }} disabled={busy} placeholder="For example: Please brighten the kitchen photo." /></label>
      <button className="btn-primary justify-self-start" disabled={busy || demo || !note.trim()}>{busy ? 'Saving…' : demo ? 'Sample — requests disabled' : 'Submit request'}</button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    <ul className="mt-5 divide-y divide-slate-100">{requests.map(r => <li key={r.id} className="py-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{photos.find(p => p.id === r.photo_id)?.filename || 'Photo request'}</strong><span className="rounded-full bg-ocean-50 px-3 py-1 text-xs text-ocean-800">{r.status === 'in_progress' ? 'In progress' : r.status === 'resolved' ? 'Resolved' : 'Open'}</span></div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.note}</p>
      {r.staff_response && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm"><strong>Our reply: </strong>{r.staff_response}</p>}
    </li>)}</ul>
  </section>;
}
