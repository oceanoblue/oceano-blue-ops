import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/ui/BrandLogo';

export const dynamic = 'force-dynamic';

const money = (c: number) =>
  `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function QuotePage({ params }: { params: { token: string } }) {
  const admin = createAdminClient() as any;
  const { data: q } = await admin
    .from('quotes')
    .select('*')
    .eq('token', params.token)
    .maybeSingle();
  if (!q) notFound();

  const expired = q.expires_at && new Date(q.expires_at) < new Date();
  if (expired) {
    return (
      <Shell>
        <h1 className="font-display text-3xl text-ocean-950">This quote has expired</h1>
        <p className="mt-3 text-slate-600">Prices move with the season — text us and we&apos;ll send an updated one today.</p>
        <a href="sms:+18432024747" className="btn-primary mt-6 inline-flex">Text us</a>
      </Shell>
    );
  }

  const { data: bs } = await admin
    .from('business_settings')
    .select('portfolio_urls')
    .eq('id', true)
    .maybeSingle();
  const portfolio: string[] = (bs?.portfolio_urls ?? []) as string[];

  const items = Array.isArray(q.line_items) ? q.line_items : [];
  const facts = [
    q.sqft ? ['Square feet', Number(q.sqft).toLocaleString('en-US')] : null,
    q.listing_date ? ['Lists', fmtDate(q.listing_date)] : null,
    ['Turnaround', '24 hrs'],
  ].filter(Boolean) as [string, string][];

  const cityLine = [q.city, q.state].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-white pb-28">
      <div className="mx-auto max-w-2xl px-6 pt-8">
        <BrandLogo variant="dark" className="mb-12 h-6 w-auto" />

        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ocean-700">
          Prepared for {q.client_name || 'you'}
        </p>
        <h1 className="mt-3 font-display text-[clamp(2.1rem,8vw,3.2rem)] font-normal leading-[1.05] tracking-tight text-ocean-950">
          {q.address_line1}
          {cityLine && <span className="mt-3 block text-[0.46em] text-slate-500">{cityLine}</span>}
        </h1>

        <dl className="mt-8 flex flex-wrap border-y border-slate-200">
          {facts.map(([k, v], i) => (
            <div key={k} className={`flex-1 py-4 ${i > 0 ? 'border-l border-slate-200 pl-4' : 'pr-4'}`}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{k}</dt>
              <dd className="mt-1.5 font-mono text-[15px] font-medium text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">What&apos;s included</h2>
          <ul className="mt-1">
            {items.map((i: any, idx: number) => (
              <li key={idx} className="flex items-baseline justify-between gap-5 border-b border-slate-200 py-4">
                <span className="text-[17px] font-medium text-ink-900">{i.name}</span>
                {i.complimentary ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ocean-700">Included</span>
                ) : (
                  <span className="whitespace-nowrap font-mono text-[15px] text-ink-800">{money(i.price_cents)}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-5 pt-6">
            <span className="text-[17px] font-semibold text-ink-900">Total</span>
            <span className="font-mono text-[28px] font-medium text-ocean-700">{money(q.subtotal_cents)}</span>
          </div>
          {q.notes && <p className="mt-6 rounded bg-ocean-50/60 p-4 text-sm text-slate-600">{q.notes}</p>}
          <p className="mt-6 rounded bg-slate-50 p-4 text-[14.5px] text-slate-600">
            Want something added or taken off? <strong className="text-ink-900">Text me and I&apos;ll resend it.</strong> Nothing is locked in until you pick a date.
          </p>
          {q.expires_at && (
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
              Held until {new Date(q.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </p>
          )}
        </section>

        {portfolio.length > 0 && (
          <section className="mt-14">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Recent work</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {portfolio.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt="Oceano Blue real estate photography"
                  loading="lazy"
                  className="aspect-[3/2] w-full rounded-lg object-cover ring-1 ring-slate-200"
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Fixed action bar — booking is the one job. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2.5 px-6 py-3.5" style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}>
          <Link href="/book" prefetch={false} className="btn-primary flex-1 justify-center py-4 text-base">
            Pick a date
          </Link>
          <a
            href={`sms:+18432024747?&body=${encodeURIComponent(`Hi Gustavo, let's book the shoot for ${q.address_line1}.`)}`}
            className="btn-secondary shrink-0 justify-center px-6 py-4 text-base"
          >
            Text
          </a>
        </div>
      </nav>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 pt-8">
        <BrandLogo variant="dark" className="mb-12 h-6 w-auto" />
        <div className="py-16">{children}</div>
      </div>
    </div>
  );
}
