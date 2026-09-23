'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import {roleWindow,type CrewTiming} from '@/lib/booking/crew-windows';
import {scheduleInput,scheduleWindow} from '@/lib/orders/schedule-window';
import {fmtTimeInTz} from '@/lib/utils/timezone';

export type Shooter = {
  key: string; // "contractor:<id>" | "team:<id>"
  kind: 'contractor' | 'team';
  id: string;
  name: string;
  payRateCents?: number;
  captureSkills: string[];
  teamMemberId?: string | null; // for a contractor: their linked team_member (scheduling identity)
};

/**
 * One photographer picker for a shoot — team members and contractors in a
 * single list, deduped (a person who is both, like Karen, appears once as the
 * contractor). Picking a contractor sets contractor_id (pay + Dropbox link) and
 * — when linked — photographer_id (calendar/availability) so they're one
 * identity. Picking a pure team member sets photographer_id only. The Dropbox
 * upload-link email lives here too, since it's a contractor-assignment action.
 */
export function AssignShooterControl({
  orderId,
  currentContractorId,
  currentPhotographerId,
  currentVideographerId,
  updatedAt,
  needsVideo,
  shooters, timing, timezone, canRenew, assignmentRound,
}: {
  orderId: string;
  currentContractorId: string | null;
  currentPhotographerId: string | null;
  currentVideographerId: string | null;
  updatedAt: string;
  needsVideo: boolean;
  shooters: Shooter[]; timing:CrewTiming; timezone:string; canRenew:boolean; assignmentRound:number;
}) {
  const router = useRouter();
  const saving = useRef(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [pendingAction,setPendingAction]=useState<'save'|'renew'>('save');
  const initialTimes=()=>Object.fromEntries((['photographer','videographer'] as const).flatMap(role=>{const w=roleWindow(timing,role);return [[`${role}From`,scheduleInput(w.start,timezone)],[`${role}To`,scheduleInput(w.end,timezone)]];}));
  const [times,setTimes]=useState(initialTimes);
  const roleText=(role:'photographer'|'videographer')=>{const w=roleWindow(timing,role);return w.start&&w.end?`${fmtTimeInTz(w.start,timezone)}–${fmtTimeInTz(w.end,timezone)}`:'Time not set';};

  // Resolve the current selection to a key that actually exists in the deduped
  // list. A person who is both a team photographer AND a contractor (e.g. Karen)
  // is shown once, as the contractor — so an order assigned via photographer_id
  // (how the booking engine auto-assigns team shooters) must map to that
  // contractor entry, otherwise the picker can't match itself and shows
  // "Unassigned" despite a real assignment.
  const current = (() => {
    if (currentContractorId) return `contractor:${currentContractorId}`;
    if (currentPhotographerId) {
      const linked = shooters.find(
        (s) => s.kind === 'contractor' && s.teamMemberId === currentPhotographerId
      );
      return linked ? linked.key : `team:${currentPhotographerId}`;
    }
    return '';
  })();
  const [photo, setPhoto] = useState(current);
  const [video, setVideo] = useState(currentVideographerId || '');
  const videoCrew = shooters.filter(s => s.captureSkills.includes('videography') && (s.kind === 'team' || s.teamMemberId));
  const videoName = shooters.find(s => (s.kind === 'team' ? s.id : s.teamMemberId) === currentVideographerId)?.name;
  const assigned = shooters.find((s) => s.key === current);
  const contractorAssigned = assigned?.kind === 'contractor';

  async function assign(action:'save'|'renew'|'review'='save',acknowledge=false) {
    if(saving.current)return; saving.current=true;setBusy(true);setError(null);setWarnings([]);
    try {
      const selected=shooters.find(x=>x.key===photo);
      const windows:Record<string,number|null>={};
      if(timing.scheduled_at&&action!=='renew')for(const role of ['photographer','videographer'] as const){
        const w=scheduleWindow(times[`${role}From`],times[`${role}To`],timezone);
        const offset=(Date.parse(w.scheduledAt)-Date.parse(timing.scheduled_at))/60000;
        if(offset<0||offset+w.duration>(timing.duration_minutes||60))throw new Error('Each crew visit must fit inside the client appointment.');
        windows[role==='photographer'?'photo_offset':'video_offset']=offset;
        windows[role==='photographer'?'photo_duration':'video_duration']=w.duration;
      }
      const response=await fetch(`/api/orders/${orderId}/crew`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,updated_at:updatedAt,round:assignmentRound,photographer_id:selected?.kind==='contractor'?selected.teamMemberId:selected?.id,contractor_id:selected?.kind==='contractor'?selected.id:null,videographer_id:video||null,acknowledge_warnings:acknowledge,...windows})});
      const data=await response.json();
      if(data.warnings?.length){setWarnings(data.warnings);if(action!=='review'){setPendingAction(action);setNeedsOverride(true);return;}}
      if(!response.ok)throw new Error(data.error||'Unable to save crew');
      if(action==='review'){if(!data.warnings?.length)setSentTo('Availability checks passed.');return;}
      setNeedsOverride(false);setEditing(false);setSentTo(action==='renew'?'New acceptance request queued. The photographer remains unconfirmed.':null);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{saving.current=false;setBusy(false);}
  }

  async function sendUploadLink() {
    setSending(true);
    setError(null);
    setSentTo(null);
    try {
      const r = await fetch(`/api/orders/${orderId}/notify-contractor`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          d.error === 'email_not_configured'
            ? 'Email isn’t set up yet — add a Resend API key (RESEND_API_KEY) in Vercel.'
            : d.error === 'dropbox_not_configured'
              ? 'Dropbox isn’t set up — can’t create the upload folder.'
              : d.error || `Failed (${r.status})`
        );
      }
      setSentTo(`Upload link sent to ${d.to ?? 'the photographer'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const qualifiedPhotos = shooters.filter(s => s.captureSkills.some(skill => ['photography', 'tour_360'].includes(skill)));
  const contractors = qualifiedPhotos.filter((s) => s.kind === 'contractor');
  const team = qualifiedPhotos.filter((s) => s.kind === 'team');

  return (
    <div>
      {!editing ? <div className="rounded-xl border border-slate-200 p-4">
        <dl className="space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Photographer / 360</dt><dd className="font-medium">{assigned?.name || 'Unassigned'}<span className="block text-xs text-slate-500">{roleText('photographer')}</span></dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Videographer</dt><dd className="font-medium">{videoName || 'Unassigned'}<span className="block text-xs text-slate-500">{roleText('videographer')}</span></dd></div></dl>
        {needsVideo && !currentVideographerId && <p className="mt-3 text-xs text-amber-800">Video is booked. Assign a videographer before the shoot.</p>}
        <button type="button" className="mt-4 text-sm font-medium text-ocean-700 underline" onClick={()=>{setPhoto(current);setVideo(currentVideographerId||'');setTimes(initialTimes());setWarnings([]);setError(null);setNeedsOverride(false);setEditing(true);}}>Edit crew</button>
      </div> : <div className="space-y-3 rounded-xl border border-ocean-200 bg-ocean-50/30 p-4">
      <label htmlFor="crew-photo" className="label flex items-center gap-2">
        Photographer
        {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      </label>
      <select id="crew-photo" value={photo} onChange={(e) => {setPhoto(e.target.value);setNeedsOverride(false);setWarnings([]);}} disabled={busy} className="input">
        <option value="">— Unassigned —</option>
        {contractors.length > 0 && (
          <optgroup label="Contractors">
            {contractors.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
                {s.payRateCents ? ` · $${(s.payRateCents / 100).toFixed(0)}/property` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {team.length > 0 && (
          <optgroup label="Team">
            {team.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      {timing.scheduled_at&&<div className="grid gap-2 sm:grid-cols-2">{(['From','To'] as const).map(edge=><label key={edge} className="text-xs">Photography {edge.toLowerCase()}<input type="datetime-local" className="input mt-1" disabled={busy} value={times[`photographer${edge}`]} onChange={e=>{setTimes({...times,[`photographer${edge}`]:e.target.value});setNeedsOverride(false);setWarnings([]);}}/></label>)}</div>}
      <label htmlFor="crew-video" className="label">Videographer</label>
      <select id="crew-video" value={video} disabled={busy} className="input" onChange={e=>{setVideo(e.target.value);setNeedsOverride(false);setWarnings([]);}}><option value="">— Unassigned —</option>{videoCrew.map(s=><option key={s.key} value={s.kind==='team'?s.id:s.teamMemberId!}>{s.name}</option>)}</select>
      {timing.scheduled_at&&video&&<div className="grid gap-2 sm:grid-cols-2">{(['From','To'] as const).map(edge=><label key={edge} className="text-xs">Video {edge.toLowerCase()}<input type="datetime-local" className="input mt-1" disabled={busy} value={times[`videographer${edge}`]} onChange={e=>{setTimes({...times,[`videographer${edge}`]:e.target.value});setNeedsOverride(false);setWarnings([]);}}/></label>)}</div>}
      <p className="text-xs text-slate-600">Each person reserves only their visit. Times are {timezone.replaceAll('_',' ')} and must fit within the client appointment. Office-assigned photographers have 24 hours to respond, or until the shoot starts if sooner.</p>
      {!needsOverride && <div className="flex gap-2"><button disabled={busy} type="button" className="btn-primary" onClick={()=>assign()}>{busy?'Saving…':'Save crew'}</button><button disabled={busy} type="button" className="btn-ghost" onClick={()=>setEditing(false)}>Cancel</button></div>}

      </div>}
      {canRenew&&!editing&&<button type="button" disabled={busy} className="btn-secondary mt-3" onClick={()=>assign('renew')}>Send new acceptance request</button>}
      {!!warnings.length&&<div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Availability needs review</p><ul className="mt-2 list-disc space-y-2 pl-5">{warnings.map(w=><li key={w}>{w}</li>)}</ul>{needsOverride&&<div className="mt-3 flex gap-2"><button className="btn-secondary" disabled={busy} onClick={()=>assign(pendingAction,true)}>{pendingAction==='renew'?'Send availability request':'Save with these warnings'}</button><button className="btn-ghost" onClick={()=>{setWarnings([]);setNeedsOverride(false);setWarnings([]);}}>Cancel</button></div>}</div>}
      {contractorAssigned && (
        <div className="mt-2">
          <button
            onClick={sendUploadLink}
            disabled={sending}
            className="btn-secondary inline-flex w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Email upload link to {assigned?.name?.split(' ')[0] ?? 'photographer'}
          </button>
          {sentTo && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> {sentTo}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
