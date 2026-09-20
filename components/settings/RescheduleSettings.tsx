'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function RescheduleSettings({ enabled, cutoff }: { enabled: boolean; cutoff: number }) {
  const [active, setActive] = useState(enabled);
  const [hours, setHours] = useState(String(cutoff));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function save() {
    const value = Number(hours);
    if (!hours.trim() || !Number.isInteger(value) || value < 0 || value > 720) { setMessage('Enter a whole number from 0 to 720.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error, data } = await (createClient() as any).from('business_settings').update({ client_rescheduling_enabled: active, client_reschedule_cutoff_hours: value }).eq('id', true).select('id').single();
      if (error || !data) throw new Error('Unable to save settings.');
      setMessage('Rescheduling settings saved.'); router.refresh();
    } catch { setMessage('Unable to save settings. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="card space-y-4 p-6"><div><h2 className="font-semibold">Client rescheduling</h2><p className="mt-1 text-sm text-slate-600">Clients can move an upcoming shoot to an available time with their assigned photographer.</p></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} disabled={busy} onChange={e => setActive(e.target.checked)} />Allow clients to change appointments</label>
    <label className="block text-sm">Cutoff before the appointment (hours)<input type="number" min="0" max="720" step="1" value={hours} disabled={busy} onChange={e => setHours(e.target.value)} className="input mt-1 block w-32" /></label>
    <p className="text-sm text-slate-500">Changes inside the cutoff go through your team. Existing booking notice, working hours, and travel buffers still apply.</p>
    <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save rescheduling settings'}</button>{message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
