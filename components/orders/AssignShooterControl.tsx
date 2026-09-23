'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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
  shooters,
}: {
  orderId: string;
  currentContractorId: string | null;
  currentPhotographerId: string | null;
  currentVideographerId: string | null;
  updatedAt: string;
  needsVideo: boolean;
  shooters: Shooter[];
}) {
  const router = useRouter();
  const saving = useRef(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [pendingSel, setPendingSel] = useState<string | null>(null);

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

  async function assign(sel: string, allowOverlap = false) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      const supabase = createClient();
      let photographerId: string | null = null;
      let contractorId: string | null = null;

      const s = sel ? shooters.find((x) => x.key === sel) : null;
      if (s?.kind === 'contractor') {
        contractorId = s.id;

        photographerId = s.teamMemberId ?? null; // linked scheduling identity
      } else if (s?.kind === 'team') {
        photographerId = s.id;
      }

      const { error } = await (supabase as any).rpc('set_order_crew', {
        p_order: orderId,
        p_photographer: photographerId,
        p_contractor: contractorId,
        p_videographer: video || null,
        p_expected_updated_at: updatedAt,
        p_allow_overlap: allowOverlap,
      });
      if (error) {
        const conflict =
          (error as any).code === '23P01' || /slot_unavailable|exclusion/i.test(error.message || '');
        if (conflict && !allowOverlap) {
          setPendingSel(sel);
          setNeedsOverride(true);
          return;
        }
        throw new Error(
          conflict ? 'A crew member is already booked around this time.' : error.message?.includes('order_changed') ? 'The order changed. Refresh before assigning the crew.' : error.message
        );
      }
      setNeedsOverride(false);
      setPendingSel(null);
      setEditing(false);

      // Calendar synchronization is queued in the same database transaction.

      // Assignment notifications are queued atomically by the database.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
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
      setSentTo(d.to ?? 'the photographer');
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
        <dl className="space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Photographer / 360</dt><dd className="font-medium">{assigned?.name || 'Unassigned'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Videographer</dt><dd className="font-medium">{videoName || 'Unassigned'}</dd></div></dl>
        {needsVideo && !currentVideographerId && <p className="mt-3 text-xs text-amber-800">Video is booked. Assign a videographer before the shoot.</p>}
        <button type="button" className="mt-4 text-sm font-medium text-ocean-700 underline" onClick={()=>{setPhoto(current);setVideo(currentVideographerId||'');setError(null);setNeedsOverride(false);setEditing(true);}}>Edit crew</button>
      </div> : <div className="space-y-3 rounded-xl border border-ocean-200 bg-ocean-50/30 p-4">
      <label htmlFor="crew-photo" className="label flex items-center gap-2">
        Photographer
        {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      </label>
      <select id="crew-photo" value={photo} onChange={(e) => {setPhoto(e.target.value);setNeedsOverride(false);}} disabled={busy} className="input">
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
      <label htmlFor="crew-video" className="label">Videographer</label>
      <select id="crew-video" value={video} disabled={busy} className="input" onChange={e=>{setVideo(e.target.value);setNeedsOverride(false);}}><option value="">— Unassigned —</option>{videoCrew.map(s=><option key={s.key} value={s.kind==='team'?s.id:s.teamMemberId!}>{s.name}</option>)}</select>
      <p className="text-xs text-slate-600">One person can cover both roles. Both people reserve the appointment window. Video assignments are managed by the office; photographer acceptance is tracked separately.</p>
      {!needsOverride && <div className="flex gap-2"><button disabled={busy} type="button" className="btn-primary" onClick={()=>assign(photo)}>{busy?'Saving…':'Save crew'}</button><button disabled={busy} type="button" className="btn-ghost" onClick={()=>setEditing(false)}>Cancel</button></div>}

      {needsOverride && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-1.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            A crew member has another shoot or a travel-buffer conflict. Assign anyway?
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => assign(pendingSel ?? '', true)}
              disabled={busy}
              className="btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Assign anyway
            </button>
            <button
              onClick={() => {
                setNeedsOverride(false);
                setPendingSel(null);
              }}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      </div>}
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
              <CheckCircle2 className="h-3.5 w-3.5" /> Sent to {sentTo}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
