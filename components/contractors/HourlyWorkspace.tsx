'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Plus, Loader2 } from 'lucide-react';
import { HOURLY_LABELS, hourlyMoney, hourlyAmount, hoursLabel, hoursToMinutes, type HourlyAssignment, type HourlyEvent } from '@/lib/contractor-work/hourly';
import { payoutLabel } from '@/components/field/PayoutMethodCard';

const API = '/api/field/hourly';
type Contractor = { id: string; full_name: string };
type List = { items: HourlyAssignment[]; contractors: Contractor[]; more: boolean; admin: boolean };
type Save = (body: Record<string, unknown>) => Promise<boolean>;
const field = 'input w-full';

export function HourlyWorkspace() {
  const router = useRouter();
  const [list, setList] = useState<List | null>(null);
  const [page, setPage] = useState(0), [status, setStatus] = useState('active');
  const [adding, setAdding] = useState(false), [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`${API}?page=${page}&status=${status}`, { cache: 'no-store', signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load hourly work.');
    setList(data);
  }, [page, status]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load]);
  async function save(body: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save.');
      setMessage(data.message);
      // A committed write remains successful even if the refresh fails.
      try { await load(); } catch { setError('Saved, but the list could not refresh. Use Reload before another action.'); }
      router.refresh();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false; }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
      <div><h2 className="font-semibold">Events & production</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">{list?.admin ? 'Set the rate per assignment. Review actual hours, approve the amount, then record payment.' : 'Review your assigned rate and expected hours. Submit actual hours after the event for office approval.'}</p></div>
      {list?.admin && <button className="btn-primary inline-flex items-center gap-2" disabled={busy || loading} onClick={() => setAdding(!adding)}><Plus className="h-4 w-4"/>{adding ? 'Close form' : 'New hourly assignment'}</button>}
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    {adding && list?.admin && <AssignmentForm contractors={list.contractors} busy={busy} save={save} onDone={() => setAdding(false)}/>}
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm">Show <select aria-label="Assignment status" value={status} disabled={busy} onChange={e => { setStatus(e.target.value); setPage(0); }} className="input ml-2">
        <option value="active">Active work</option><option value="all">All work & history</option>
        {Object.entries(HOURLY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <button className="btn-secondary" disabled={busy || loading} onClick={async () => { setLoading(true); setError(''); try { await load(); } catch(e) { setError(e instanceof Error ? e.message : 'Could not reload.'); } finally { setLoading(false); } }}>Reload</button>
    </div>
    {loading ? <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin"/>Loading hourly work…</div> : list && <>
      {!list.items.length && <div className="card p-8 text-center text-slate-500">No hourly assignments in this view.{list.admin ? ' Create an assignment above to get started.' : ' The office will add your events here.'}</div>}
      <div className="space-y-4">{list.items.map(item => <AssignmentCard key={`${item.id}:${item.version}`} item={item} admin={list.admin} busy={busy} save={save}/>)}</div>
      <div className="flex items-center justify-between text-sm"><button disabled={busy || page === 0} className="btn-secondary disabled:opacity-40" onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={busy || !list.more} className="btn-secondary disabled:opacity-40" onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}
  </div>;
}

function AssignmentForm({ initial, contractors = [], busy, save, onDone }: { initial?: HourlyAssignment; contractors?: Contractor[]; busy: boolean; save: Save; onDone: () => void }) {
  const requestId = useRef<string | null>(null);
  const [form, setForm] = useState({ contractor_id: initial?.contractor_id ?? '', title: initial?.title ?? '', event_type: initial?.event_type ?? '', role: initial?.role ?? 'Photographer', location: initial?.location ?? '', event_date: initial?.event_date ?? '', rate: initial ? String(initial.rate_cents / 100) : '', hours: initial ? String(Number((initial.estimated_minutes / 60).toFixed(2))) : '', instructions: initial?.instructions ?? '' });
  const [validation, setValidation] = useState('');
  function update(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  const cents = Math.round(Number(form.rate) * 100), minutes = hoursToMinutes(form.hours);
  async function submit(e: FormEvent) {
    e.preventDefault(); setValidation('');
    if (!/^\d+(\.\d{1,2})?$/.test(form.rate) || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440 || cents < 1 || cents > 1000000) { setValidation('Enter a positive rate and between 1 minute and 24 hours.'); return; }
    requestId.current ??= crypto.randomUUID();
    const { rate: _rate, hours: _hours, contractor_id, ...details } = form;
    const ok = await save({ ...details, rate_cents: cents, estimated_minutes: minutes, ...(initial ? { action: 'edit', id: initial.id, version: initial.version } : { action: 'create', id: requestId.current, contractor_id }) });
    if (ok) onDone();
  }
  return <form onSubmit={submit} className="card space-y-4 p-5">
    <h3 className="font-semibold">{initial ? 'Edit assignment terms' : 'New hourly assignment'}</h3>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {!initial && <label className="space-y-1 text-sm">Contractor<select required className={field} value={form.contractor_id} onChange={e => update('contractor_id', e.target.value)}><option value="">Choose contractor</option>{contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>}
      <label className="space-y-1 text-sm">Event / production<input required minLength={2} maxLength={180} className={field} value={form.title} onChange={e => update('title', e.target.value)} placeholder="Corporate reception"/></label>
      <label className="space-y-1 text-sm">Event type<input required minLength={2} maxLength={100} className={field} value={form.event_type} onChange={e => update('event_type', e.target.value)} placeholder="Corporate, wedding, commercial…"/></label>
      <label className="space-y-1 text-sm">Role<input required minLength={2} maxLength={100} className={field} value={form.role} onChange={e => update('role', e.target.value)} placeholder="Videographer"/></label>
      <label className="space-y-1 text-sm">Date<input required type="date" className={field} value={form.event_date} onChange={e => update('event_date', e.target.value)}/></label>
      <label className="space-y-1 text-sm">Location<input maxLength={250} className={field} value={form.location} onChange={e => update('location', e.target.value)}/></label>
      <label className="space-y-1 text-sm">Hourly rate ($)<input required type="number" min="0.01" max="10000" step="0.01" className={field} value={form.rate} onChange={e => update('rate', e.target.value)} placeholder="75.00"/><span className="block text-xs text-slate-500">Set any agreed rate for this assignment.</span></label>
      <label className="space-y-1 text-sm">Estimated hours<input required type="number" min="0.02" max="24" step="0.01" className={field} value={form.hours} onChange={e => update('hours', e.target.value)} placeholder="4.5"/><span className="block text-xs text-slate-500">4.5 = 4 hours 30 minutes. Use one assignment per event day.</span></label>
      <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Estimated pay</p><p className="mt-1 text-xl font-semibold">{cents > 0 && minutes > 0 ? hourlyMoney(hourlyAmount(cents, minutes)) : '—'}</p><p className="mt-1 text-xs text-slate-500">Actual pay depends on approved hours.</p></div>
      <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3">Assignment notes<textarea rows={3} maxLength={4000} className={field} value={form.instructions} onChange={e => update('instructions', e.target.value)} placeholder="Coverage, equipment, setup time and other agreed details"/></label>
    </fieldset>
    {validation && <p role="alert" className="text-sm text-rose-600">{validation}</p>}
    <div className="flex gap-2"><button disabled={busy} className="btn-primary">{busy ? 'Saving…' : initial ? 'Save terms' : 'Create assignment'}</button><button disabled={busy} type="button" className="btn-ghost" onClick={onDone}>Cancel</button></div>
  </form>;
}

function AssignmentCard({ item: a, admin, busy, save }: { item: HourlyAssignment; admin: boolean; busy: boolean; save: Save }) {
  const [editing, setEditing] = useState(false), [hours, setHours] = useState(a.actual_minutes ? String(Number((a.actual_minutes / 60).toFixed(2))) : '');
  const [note, setNote] = useState(''), [localError, setLocalError] = useState('');
  const [events, setEvents] = useState<HourlyEvent[] | null>(null), [historyBusy, setHistoryBusy] = useState(false);
  async function act(action: string) {
    setLocalError('');
    const minutes = hoursToMinutes(hours);
    if (['submit', 'approve'].includes(action) && (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440)) { setLocalError('Enter actual hours between 1 minute and 24 hours.'); return; }
    if (['pay', 'return', 'cancel'].includes(action) && note.trim().length < 3) { setLocalError(action === 'pay' ? 'Enter the payment method and reference in the note.' : 'Enter a reason in the note.'); return; }
    if (action === 'pay' && !window.confirm(`Record ${hourlyMoney(a.amount_cents ?? 0)} as paid for ${a.title}? Only continue if you have already sent the payment.`)) return;
    if (action === 'cancel' && !window.confirm(`Cancel ${a.title}? Its history will be kept and it will no longer be owed.`)) return;
    await save({ action, id: a.id, version: a.version, note, ...(action === 'submit' ? { actual_minutes: minutes } : action === 'approve' ? { approved_minutes: minutes } : {}) });
  }
  async function history() {
    if (events) { setEvents(null); return; }
    setHistoryBusy(true); setLocalError('');
    try { const response = await fetch(`${API}?id=${a.id}`, { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setEvents(data.events); }
    catch(e) { setLocalError(e instanceof Error ? e.message : 'Could not load history.'); } finally { setHistoryBusy(false); }
  }
  const open = !['paid', 'cancelled'].includes(a.status);
  const canHours = a.status === 'assigned' || (admin && a.status === 'submitted');
  const tones = a.status === 'paid' ? 'bg-emerald-50 text-emerald-800' : a.status === 'submitted' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <article className="card space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{a.event_type} · {a.role}</p><h3 className="mt-1 text-lg font-semibold">{a.title}</h3><p className="mt-1 text-sm text-slate-500">{a.event_date} {a.location && `· ${a.location}`}</p>{admin && <p className="mt-1 text-sm font-medium">{a.contractors?.full_name ?? 'Contractor'}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones}`}>{HOURLY_LABELS[a.status]}</span></div>
    <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
      <Metric label="Agreed rate" value={`${hourlyMoney(a.rate_cents)}/hr`}/><Metric label="Estimated time" value={hoursLabel(a.estimated_minutes)}/><Metric label="Submitted time" value={a.actual_minutes ? hoursLabel(a.actual_minutes) : '—'}/><Metric label={a.status === 'paid' ? 'Paid' : 'Approved pay'} value={a.amount_cents != null ? hourlyMoney(a.amount_cents) : '—'}/>
    </div>
    {a.approved_minutes != null && <p className="text-sm text-slate-600">{hoursLabel(a.approved_minutes)} approved × {hourlyMoney(a.rate_cents)}/hr = {hourlyMoney(a.amount_cents ?? 0)}</p>}
    {a.instructions && <p className="whitespace-pre-wrap text-sm text-slate-600">{a.instructions}</p>}
    {a.time_note && <p className="whitespace-pre-wrap text-sm"><strong>Time note:</strong> {a.time_note}</p>}
    {a.review_note && <p className="whitespace-pre-wrap text-sm"><strong>Office note:</strong> {a.review_note}</p>}
    {a.paid_at && <p className="text-sm text-emerald-800">Payment recorded {new Date(a.paid_at).toLocaleDateString()}: {a.paid_note}</p>}
    {admin && a.status === 'approved' && a.contractors?.payout_method && <p className="text-sm text-slate-600">Payout preference: {payoutLabel(a.contractors.payout_method) ?? a.contractors.payout_method}{a.contractors.payout_details ? ` · ${a.contractors.payout_details}` : ''}</p>}
    {editing ? <AssignmentForm initial={a} busy={busy} save={save} onDone={() => setEditing(false)}/> : open && (admin || canHours) && <fieldset disabled={busy} className="space-y-3 border-t border-slate-100 pt-4">
      {canHours && <div className="flex flex-wrap items-end gap-4"><label className="space-y-1 text-sm">{a.status === 'submitted' ? 'Hours to approve' : 'Actual hours worked'}<input aria-label={`Hours for ${a.title}`} type="number" min="0.02" max="24" step="0.01" value={hours} onChange={e => setHours(e.target.value)} className={`${field} max-w-44`} placeholder="4.5"/></label>{hoursToMinutes(hours) > 0 && <p className="pb-2 text-sm text-slate-600">{hoursLabel(hoursToMinutes(hours))} · {hourlyMoney(hourlyAmount(a.rate_cents, hoursToMinutes(hours)))}</p>}</div>}
      <label className="block space-y-1 text-sm">{a.status === 'approved' ? 'Payment method / reference, or reason for a change' : 'Note'}<textarea aria-label={`Note for ${a.title}`} maxLength={2000} rows={2} value={note} onChange={e => setNote(e.target.value)} className={field} placeholder={a.status === 'approved' ? 'e.g. Zelle, October 16, confirmation 1234' : 'Explain extra time or an adjustment to submitted hours'}/></label>
      <div className="flex flex-wrap gap-2">
        {a.status === 'assigned' && <button className="btn-primary" onClick={() => act('submit')}>{admin ? 'Record hours for approval' : 'Submit hours'}</button>}
        {admin && a.status === 'submitted' && <button className="btn-primary" onClick={() => act('approve')}>Approve hours & pay amount</button>}
        {admin && a.status === 'approved' && <button className="btn-primary" onClick={() => act('pay')}>Record payment</button>}
        {admin && a.status === 'assigned' && <button className="btn-secondary" onClick={() => setEditing(true)}>Edit rate & details</button>}
        {admin && ['submitted', 'approved'].includes(a.status) && <button className="btn-secondary" onClick={() => act('return')}>Return for changes</button>}
        {admin && <button className="btn-ghost text-rose-600" onClick={() => act('cancel')}>Cancel assignment</button>}
      </div>
      {a.status === 'approved' && <p className="text-xs text-slate-500">Record payment after you send it. Ops does not transfer funds.</p>}
    </fieldset>}
    {localError && <p role="alert" className="text-sm text-rose-600">{localError}</p>}
    <button disabled={historyBusy} className="inline-flex items-center gap-1.5 text-sm text-ocean-600" onClick={history}><Clock className="h-4 w-4"/>{historyBusy ? 'Loading history…' : events ? 'Hide history' : 'View history'}</button>
    {events && <ol className="space-y-3 border-t border-slate-100 pt-4">{events.map(e => <li key={e.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{({ create: 'Assignment created', edit: 'Terms updated', submit: 'Hours submitted', approve: 'Hours approved', return: 'Returned for changes', cancel: 'Cancelled', pay: 'Payment recorded' } as Record<string, string>)[e.kind] ?? e.kind} · {new Date(e.created_at).toLocaleString()}</p><p className="mt-1 text-slate-600">Rate: {hourlyMoney(e.details.after.rate_cents)}/hr · Estimated: {hoursLabel(e.details.after.estimated_minutes)}{e.details.after.actual_minutes != null ? ` · Submitted: ${hoursLabel(e.details.after.actual_minutes)}` : ''}{e.details.after.approved_minutes != null ? ` · Approved: ${hoursLabel(e.details.after.approved_minutes)} / ${hourlyMoney(e.details.after.amount_cents ?? 0)}` : ''}</p>{e.kind === 'edit' && e.details.before && <p className="text-xs text-slate-500">Previous rate: {hourlyMoney(e.details.before.rate_cents)}/hr · Previous estimate: {hoursLabel(e.details.before.estimated_minutes)}</p>}<p className="mt-1 whitespace-pre-wrap text-slate-600">{e.kind === 'pay' ? e.details.after.paid_note : e.kind === 'submit' ? e.details.after.time_note : e.details.after.review_note}</p></li>)}</ol>}
  </article>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>; }
