import Link from 'next/link';
import { Check, X, CheckCircle2, XCircle, AlertTriangle, MapPin, CalendarDays } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyRespondToken } from '@/lib/field/respond-token';
import { fmtDateTimeTz } from '@/lib/utils/format';
import { PortalHero } from '@/components/portal/PortalHero';

export const dynamic = 'force-dynamic';

/**
 * Login-free confirm page for a contractor's accept / decline, reached from the
 * assignment email or the calendar invite. The signed token identifies the
 * shoot + photographer; the buttons POST to /api/field/respond/[token]. No
 * pricing is shown — only what the field portal itself would show them.
 */
export default async function RespondPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { choice?: string; state?: string };
}) {
  const token = decodeURIComponent(params.token);
  const payload = verifyRespondToken(token);

  if (!payload) {
    return (
      <Shell title="This link has expired">
        <Card>
          <p className="inline-flex items-start gap-2 text-sm text-slate-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              This accept / decline link is no longer valid. Open your photographer portal to
              respond to the shoot there.
            </span>
          </p>
          <PortalLink />
        </Card>
      </Shell>
    );
  }

  const admin = createAdminClient() as any;
  const [{ data: order }, { data: contractor }] = await Promise.all([
    admin
      .from('orders')
      .select(
        'id, status, archived_at, scheduled_at, timezone, contractor_id, contractor_response, contractor_response_note, dropbox_intake_url, listings(address_line1, city, state, zip, sqft)'
      )
      .eq('id', payload.o)
      .maybeSingle(),
    admin.from('contractors').select('id, full_name').eq('id', payload.c).maybeSingle(),
  ]);

  const live =
    order &&
    order.contractor_id === payload.c &&
    !order.archived_at &&
    !['cancelled', 'draft'].includes(order.status);

  if (!live || !contractor) {
    return (
      <Shell title="This shoot has changed">
        <Card>
          <p className="inline-flex items-start gap-2 text-sm text-slate-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              This shoot is no longer assigned to you, or it was cancelled. Nothing to do here —
              your portal always shows what&rsquo;s current.
            </span>
          </p>
          <PortalLink />
        </Card>
      </Shell>
    );
  }

  const l = (order.listings ?? {}) as any;
  const address = l.address_line1 || 'Shoot';
  const cityStateZip = [l.city, l.state, l.zip].filter(Boolean).join(', ');
  const when = order.scheduled_at ? fmtDateTimeTz(order.scheduled_at, order.timezone) : null;
  const first = (contractor.full_name || '').split(' ')[0] || 'there';
  const action = `/api/field/respond/${encodeURIComponent(token)}`;

  // Just answered (redirected back from the POST), or answered earlier.
  const state = searchParams.state === 'stale' ? null : searchParams.state;
  const current = (state as 'accepted' | 'declined' | undefined) ?? order.contractor_response ?? null;

  if (current === 'accepted') {
    return (
      <Shell title={`Thanks, ${first}!`}>
        <ShootCard address={address} cityStateZip={cityStateZip} when={when} />
        <Card>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-5 w-5" /> You accepted this shoot.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            It&rsquo;s on your calendar. When you&rsquo;re done shooting, upload the RAWs to the
            folder below.
          </p>
          {order.dropbox_intake_url && (
            <a href={order.dropbox_intake_url} className="btn-primary mt-4 inline-flex">
              Open upload folder
            </a>
          )}
          <ChangeMind action={action} to="declined" />
          <PortalLink />
        </Card>
      </Shell>
    );
  }

  if (current === 'declined') {
    return (
      <Shell title="Got it">
        <ShootCard address={address} cityStateZip={cityStateZip} when={when} />
        <Card>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-rose-700">
            <XCircle className="h-5 w-5" /> You declined this shoot.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            The office has been told and will reassign it. Changed your mind? You can still
            accept it below.
          </p>
          <ChangeMind action={action} to="accepted" />
          <PortalLink />
        </Card>
      </Shell>
    );
  }

  const choice = searchParams.choice === 'declined' ? 'declined' : 'accepted';

  return (
    <Shell title={`Hi ${first}, can you shoot this?`}>
      <ShootCard address={address} cityStateZip={cityStateZip} when={when} />
      <Card>
        {choice === 'accepted' ? (
          <form action={action} method="POST" className="space-y-3">
            <input type="hidden" name="response" value="accepted" />
            <button className="btn-primary inline-flex w-full items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-4 w-4" /> Yes, I&rsquo;ll take it
            </button>
            <Link
              href={`?choice=declined`}
              className="block text-center text-sm text-slate-500 underline-offset-2 hover:underline"
            >
              I can&rsquo;t make this one
            </Link>
          </form>
        ) : (
          <form action={action} method="POST" className="space-y-3">
            <input type="hidden" name="response" value="declined" />
            <label className="label">Reason (optional)</label>
            <textarea
              name="note"
              rows={2}
              maxLength={2000}
              className="input"
              placeholder="Booked that day, out of town…"
            />
            <button className="btn-secondary inline-flex w-full items-center justify-center gap-2 text-rose-700">
              <X className="h-4 w-4" /> Decline this shoot
            </button>
            <Link
              href={`?choice=accepted`}
              className="block text-center text-sm text-slate-500 underline-offset-2 hover:underline"
            >
              Actually, I can take it
            </Link>
          </form>
        )}
      </Card>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero eyebrow="Photographers" title={title} />
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="card p-5">{children}</section>;
}

function ShootCard({ address, cityStateZip, when }: { address: string; cityStateZip: string; when: string | null }) {
  return (
    <Card>
      <div className="font-display text-lg font-semibold text-ink-900">{address}</div>
      <dl className="mt-2 space-y-1.5 text-sm text-slate-600">
        {cityStateZip && (
          <div className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-slate-400" /> {cityStateZip}
          </div>
        )}
        {when && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-slate-400" /> {when}
          </div>
        )}
      </dl>
    </Card>
  );
}

function ChangeMind({ action, to }: { action: string; to: 'accepted' | 'declined' }) {
  return (
    <form action={action} method="POST" className="mt-4">
      <input type="hidden" name="response" value={to} />
      <button className="text-xs text-slate-500 underline-offset-2 hover:underline">
        {to === 'accepted' ? 'Accept it after all' : 'I need to decline after all'}
      </button>
    </form>
  );
}

function PortalLink() {
  return (
    <p className="mt-4 text-xs text-slate-500">
      <Link href="/field/shoots" className="text-ocean-700 hover:underline">
        Open your photographer portal
      </Link>{' '}
      to see all your shoots.
    </p>
  );
}
