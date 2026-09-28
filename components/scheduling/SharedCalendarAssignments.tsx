'use client';

import { useEffect, useState } from 'react';

type Calendar = { id: string; summary?: string; accessRole: string; viewer_team_member_id: string; account_email?: string };
type Assignment = { team_member_id: string; viewer_team_member_id: string; calendar_id: string };

export function SharedCalendarAssignments({ members }: { members: { id: string; full_name: string }[] }) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [member, setMember] = useState('');
  const [calendar, setCalendar] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/scheduling/shared-calendars', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load shared calendars.');
    setCalendars(data.calendars);
    setAssignments(data.assignments);
  }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  async function change(method: 'POST' | 'DELETE', assignment: Assignment) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/scheduling/shared-calendars', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(assignment) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save calendar assignment.');
      await load();
      setMessage(method === 'POST' ? 'Shared calendar assigned. Client slots now use its busy times.' : 'Assignment removed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save calendar assignment.'); }
    finally { setBusy(false); }
  }
  const choices = calendars.filter(c => c.viewer_team_member_id !== member && !assignments.some(a => a.viewer_team_member_id === c.viewer_team_member_id && a.calendar_id === c.id && a.team_member_id !== member));
  return <section className="card space-y-4 p-5 sm:p-6">
    <h2 className="text-lg font-semibold">Calendars shared by crew</h2>
    <p className="text-sm text-slate-600">Assign a shared calendar to its owner. Busy events then block that crew member’s client booking slots and do not block the connected account’s slots.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Crew member<select className="input mt-2" value={member} onChange={e => { setMember(e.target.value); setCalendar(''); }}><option value="">Select crew member</option>{members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>
      <label className="text-sm">Shared calendar<select className="input mt-2" value={calendar} onChange={e => setCalendar(e.target.value)} disabled={!member}><option value="">Select calendar</option>{choices.map(c => <option key={`${c.viewer_team_member_id}:${c.id}`} value={`${c.viewer_team_member_id}:${c.id}`}>{c.summary || c.id} · via {c.account_email || 'connected account'}</option>)}</select></label>
    </div>
    <button className="btn-secondary" disabled={busy || !member || !calendar} onClick={() => { const [viewer_team_member_id, ...parts] = calendar.split(':'); change('POST', { team_member_id: member, viewer_team_member_id, calendar_id: parts.join(':') }); }}>Assign calendar</button>
    {assignments.length > 0 && <ul className="space-y-2">{assignments.map(a => <li key={`${a.viewer_team_member_id}:${a.calendar_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{members.find(m => m.id === a.team_member_id)?.full_name || 'Crew member'} · {calendars.find(c => c.id === a.calendar_id && c.viewer_team_member_id === a.viewer_team_member_id)?.summary || a.calendar_id}</span><button className="text-ocean-700 underline" disabled={busy} onClick={() => change('DELETE', a)}>Remove</button></li>)}</ul>}
    <p role="status" className="text-sm text-slate-600">{message}</p>
  </section>;
}
