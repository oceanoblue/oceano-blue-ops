'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDateTimeTz } from '@/lib/utils/format';

export function RescheduleAppointment({ orderId, scheduledAt, timezone, reason, cutoff }: {
  orderId: string; scheduledAt: string; timezone: string; reason: string | null; cutoff: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [previous, setPrevious] = useState(scheduledAt);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function findTimes() {
    setBusy(true); setError(''); setMessage(''); setSelected(''); setSlots([]); setRequestId('');
    try {
      const response = await fetch(`/api/portal/orders/${orderId}/reschedule?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load times. Please try again.');
      setPrevious(data.previous); setSlots(data.slots.map((slot: { iso: string }) => slot.iso));
      if (!data.slots.length) setMessage(data.calendarDegraded ? 'We cannot verify the calendar right now. Try again later or contact us.' : 'No times available on this date. Choose another date.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load times.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    try {
      const response = await fetch(`/api/portal/orders/${orderId}/reschedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: id, previous, scheduled_at: selected }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to confirm. Please retry with the same selection.');
      setMessage(`Appointment changed to ${fmtDateTimeTz(data.scheduled_at, timezone)}. Confirmation and calendar updates are on their way.`);
      setOpen(false); setSlots([]); setSelected(''); setRequestId(''); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to confirm. Please retry.'); }
    finally { setBusy(false); }
  }
  return <div className="w-full border-t border-slate-100 pt-3 text-sm">
    <p className="font-medium">Appointment: {fmtDateTimeTz(scheduledAt, timezone)}</p>
    {reason ? <p className="mt-1 text-slate-500">{reason}</p> : <button type="button" className="mt-2 text-ocean-700 underline" onClick={() => setOpen(!open)} disabled={busy}>{open ? 'Close rescheduling' : 'Change appointment'}</button>}
    {open && !reason && <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
      <p>Choose a new time with your assigned photographer. Online changes close {cutoff} hours before your appointment. Times shown in {timezone}.</p>
      <div className="flex flex-wrap items-end gap-3"><label className="space-y-1">New date<input className="input block" type="date" value={date} disabled={busy} onChange={e => { setDate(e.target.value); setSlots([]); setSelected(''); setRequestId(''); }} /></label>
      <button type="button" className="btn-secondary" disabled={busy || !date} onClick={findTimes}>{busy ? 'Please wait…' : 'Find available times'}</button></div>
      {slots.length > 0 && <label className="block">Available time<select className="input mt-1 block w-full" value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setRequestId(''); }}><option value="">Choose a time</option>{slots.map(iso => <option key={iso} value={iso}>{fmtDateTimeTz(iso, timezone)}</option>)}</select></label>}
      {selected && <div className="space-y-2"><p>Your appointment will move to <strong>{fmtDateTimeTz(selected, timezone)}</strong>.</p><button type="button" className="btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Confirming…' : 'Confirm new appointment'}</button></div>}
    </div>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {message && <p role="status" className="mt-2 text-slate-700">{message}</p>}
  </div>;
}
