import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  DELIVERY_TYPES,
  DELIVERY_STATUSES,
  STATUS_STYLE,
  humanizeToken,
} from '@/lib/deliveries/constants';
import { parseDeliveryFilters, buildDeliveryQuery } from '@/lib/deliveries/filters';
import { ClientFilterSelect, CopyLinkButton } from '@/components/deliveries/HubControls';

export const dynamic = 'force-dynamic';

const BASE = '/dashboard/deliveries';

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { status, type, client } = parseDeliveryFilters(searchParams);

  const supabase = createClient();
  let query = supabase
    .from('delivery_versions')
    .select('id, title, delivery_type, status, version_number, external_url, created_at, job_id, jobs(title, client_id)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('delivery_type', type);

  const [{ data: deliveries }, { data: clientRows }, { data: links }] = await Promise.all([
    query,
    supabase.from('clients').select('id, full_name').eq('is_archived', false).order('full_name'),
    (supabase as any)
      .from('delivery_links')
      .select('delivery_version_id, view_count, download_count')
      .not('delivery_version_id', 'is', null),
  ]);

  const clientName = new Map<string, string>((clientRows ?? []).map((c: any) => [c.id, c.full_name]));
  const linkByVersion = new Map<string, { view_count: number; download_count: number }>();
  for (const l of (links ?? []) as any[]) linkByVersion.set(l.delivery_version_id, l);

  // Client filter applied in JS (small table) against the job's client.
  let rows = (deliveries ?? []) as any[];
  if (client) rows = rows.filter((d) => d.jobs?.client_id === client);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Deliveries</h1>
        <p className="text-sm text-slate-600">Draft and final deliverables across all jobs.</p>
      </div>

      <div className="space-y-2">
        <FilterRow
          label="Status"
          options={DELIVERY_STATUSES}
          active={status}
          hrefFor={(value) => `${BASE}${buildDeliveryQuery({ status: value, type, client })}`}
          allHref={`${BASE}${buildDeliveryQuery({ status: null, type, client })}`}
        />
        <FilterRow
          label="Type"
          options={DELIVERY_TYPES}
          active={type}
          hrefFor={(value) => `${BASE}${buildDeliveryQuery({ status, type: value, client })}`}
          allHref={`${BASE}${buildDeliveryQuery({ status, type: null, client })}`}
        />
        <div className="flex items-center gap-1.5">
          <span className="mr-1 w-12 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
            Client
          </span>
          <ClientFilterSelect clients={(clientRows ?? []) as any} value={client} status={status} type={type} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Title</th>
              <th className="table-head px-4 py-3">Client</th>
              <th className="table-head px-4 py-3">Type</th>
              <th className="table-head px-4 py-3">Version</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Link</th>
              <th className="table-head px-4 py-3">Engagement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((d: any) => {
              const counts = linkByVersion.get(d.id);
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {d.job_id ? (
                      <Link href={`/dashboard/jobs/${d.job_id}`} className="text-ocean-800 hover:underline">
                        {d.title ?? 'Delivery'}
                      </Link>
                    ) : (
                      (d.title ?? 'Delivery')
                    )}
                    <div className="text-xs text-slate-400">{d.jobs?.title ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {d.jobs?.client_id ? clientName.get(d.jobs.client_id) ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700">{humanizeToken(d.delivery_type)}</td>
                  <td className="px-4 py-3 text-slate-500">v{d.version_number}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${STATUS_STYLE[d.status] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
                      {humanizeToken(d.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {d.external_url ? (
                      <span className="inline-flex items-center gap-2">
                        <a href={d.external_url} className="text-ocean-700 hover:underline" target="_blank" rel="noreferrer">
                          Open →
                        </a>
                        <CopyLinkButton url={d.external_url} />
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {counts ? `${counts.view_count} views · ${counts.download_count} downloads` : '—'}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {status || type || client ? 'No deliveries match these filters.' : 'No deliveries yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        {rows.length} {rows.length === 1 ? 'delivery' : 'deliveries'}
        {status || type || client ? ' (filtered)' : ''}
        {rows.length === 100 ? ' · showing first 100' : ''}
      </p>
    </div>
  );
}

function FilterRow({
  label,
  options,
  active,
  hrefFor,
  allHref,
}: {
  label: string;
  options: string[];
  active: string | null;
  hrefFor: (value: string) => string;
  allHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-12 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <Chip href={allHref} label="All" active={active === null} />
      {options.map((value) => (
        <Chip key={value} href={hrefFor(value)} label={humanizeToken(value)} active={active === value} />
      ))}
    </div>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  const cls = active
    ? 'bg-ocean-700 text-white'
    : 'bg-slate-100 text-slate-600 hover:bg-slate-200';
  return (
    <Link href={href} className={`pill capitalize ${cls}`} scroll={false}>
      {label}
    </Link>
  );
}
