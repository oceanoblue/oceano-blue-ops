'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export type Shooter = {
  key: string; // "contractor:<id>" | "team:<id>"
  kind: 'contractor' | 'team';
  id: string;
  name: string;
  payRateCents?: number;
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
  shooters,
}: {
  orderId: string;
  currentContractorId: string | null;
  currentPhotographerId: string | null;
  shooters: Shooter[];
}) {
  const router = useRouter();
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
  const assigned = shooters.find((s) => s.key === current);
  const contractorAssigned = assigned?.kind === 'contractor';

  async function assign(sel: string, allowOverlap = false) {
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      const supabase = createClient();
      let photographerId: string | null = null;
      let contractorId: string | null = null;
      let payCents = 0;
      const s = sel ? shooters.find((x) => x.key === sel) : null;
      if (s?.kind === 'contractor') {
        contractorId = s.id;
        payCents = s.payRateCents ?? 0;
        photographerId = s.teamMemberId ?? null; // linked scheduling identity
      } else if (s?.kind === 'team') {
        photographerId = s.id;
      }

      const { error } = await (supabase as any).rpc('assign_order_shooter', {
        p_order_id: orderId,
        p_photographer_id: photographerId,
        p_contractor_id: contractorId,
        p_pay_amount_cents: payCents,
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
          conflict ? 'That photographer is already booked around this time.' : error.message
        );
      }
      setNeedsOverride(false);
      setPendingSel(null);

      // Reassigning moves the shoot between calendars (assignee busy-event flips
      // to the new shooter; the master stays). Fire-and-forget.
      fetch(`/api/orders/${orderId}/sync-calendar`, { method: 'POST' }).catch(() => {});

      // Auto-notify the photographer the moment they're assigned (not just when
      // the office remembers to hit the button). Non-fatal: the manual "Email
      // upload link" button below is still there as a fallback / re-send.
      const picked = sel ? shooters.find((x) => x.key === sel) : null;
      if (picked?.kind === 'contractor') {
        try {
          const r = await fetch(`/api/orders/${orderId}/notify-contractor`, { method: 'POST' });
          const d = await r.json().catch(() => ({}));
          if (r.ok) setSentTo(d.to ?? picked.name);
        } catch {
          /* office can re-send with the button */
        }
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
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

  const contractors = shooters.filter((s) => s.kind === 'contractor');
  const team = shooters.filter((s) => s.kind === 'team');

  return (
    <div>
      <label className="label flex items-center gap-2">
        Photographer
        {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      </label>
      <select value={current} onChange={(e) => assign(e.target.value)} disabled={busy} className="input">
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

      {needsOverride && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-1.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This photographer already has a shoot inside the travel buffer of this one. Assign anyway?
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
