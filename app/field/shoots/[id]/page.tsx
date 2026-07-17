import { redirect, notFound } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PortalHero } from '@/components/portal/PortalHero';
import { ShootUpload } from '@/components/field/ShootUpload';

export const dynamic = 'force-dynamic';

export default async function FieldShootDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/field');

  // RLS returns this only if it's the caller's own shoot.
  const { data: shoot } = await supabase
    .from('orders')
    .select('id, status, source, created_at, dropbox_intake_url, internal_notes, listings(address_line1, address_line2, city, state, zip, sqft, bedrooms, bathrooms, property_type)')
    .eq('id', params.id)
    .maybeSingle();
  if (!shoot) notFound();

  const l = (shoot.listings ?? {}) as any;

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="Shoot"
        title={l.address_line1 ?? 'Property'}
        subtitle={[l.city, l.state, l.zip].filter(Boolean).join(', ')}
        backHref="/field/shoots"
        backLabel="My shoots"
      >
        <StatusBadge status={shoot.status} />
      </PortalHero>

      <main className="mx-auto max-w-lg space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Upload RAWs</h2>
          <ShootUpload
            orderId={shoot.id}
            intakeUrl={shoot.dropbox_intake_url}
            status={shoot.status}
          />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Details</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Address">
              <span className="inline-flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  {[l.address_line1, l.address_line2].filter(Boolean).join(', ')}
                  <br />
                  {[l.city, l.state, l.zip].filter(Boolean).join(', ')}
                </span>
              </span>
            </Row>
            <Row label="Size">{l.sqft ? `${l.sqft.toLocaleString()} sqft` : '—'}</Row>
            <Row label="Beds / baths">
              {(l.bedrooms ?? '—') + ' bd · ' + (l.bathrooms ?? '—') + ' ba'}
            </Row>
            <Row label="Logged">{fmtDateTime(shoot.created_at)}</Row>
            {shoot.internal_notes && <Row label="Services">{shoot.internal_notes.replace(/^Field services:\s*/, '')}</Row>}
          </dl>
        </section>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{children}</dd>
    </div>
  );
}
