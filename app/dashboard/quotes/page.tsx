import Link from 'next/link';
import { FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';

export const dynamic = 'force-dynamic';

const usd = (c?: number | null) => (c && c > 0 ? `$${(c / 100).toLocaleString('en-US')}` : '—');

const COLUMNS: Column<any>[] = [
  {
    key: 'client',
    header: 'Client',
    cell: (q) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={q.client_name || q.address_line1} />
        <div className="min-w-0">
          <div className="truncate font-medium text-ocean-900">{q.client_name || '—'}</div>
          <div className="truncate text-xs text-slate-500">{q.address_line1}{q.city ? `, ${q.city}` : ''}</div>
        </div>
      </div>
    ),
  },
  { key: 'total', header: 'Total', className: 'tabular-nums text-slate-700', cell: (q) => usd(q.subtotal_cents) },
  {
    key: 'status',
    header: 'Status',
    cell: (q) => {
      const expired = q.expires_at && new Date(q.expires_at) < new Date();
      const s = expired ? 'expired' : q.status;
      const cls = s === 'accepted' ? 'bg-emerald-100 text-emerald-700' : s === 'expired' ? 'bg-slate-100 text-slate-500' : 'bg-ocean-100 text-ocean-700';
      return <span className={`pill ${cls} capitalize`}>{s}</span>;
    },
  },
  { key: 'created', header: 'Created', className: 'text-slate-500', cell: (q) => new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
];

export default async function QuotesPage() {
  const supabase = createClient() as any; // quotes table not yet in generated types
  const { data: quotes, error } = await supabase
    .from('quotes')
    .select('id, token, client_name, address_line1, city, subtotal_cents, status, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales" icon={FileText} title="Quotes" subtitle="Priced quotes you can share with a link.">
        <Link href="/dashboard/quotes/new" className="btn-primary">New quote</Link>
      </PageHeader>
      <DataTable
        columns={COLUMNS}
        rows={quotes ?? []}
        rowKey={(q) => q.id}
        rowHref={(q) => `/quote/${q.token}`}
        empty={
          <EmptyState
            icon={FileText}
            title="No quotes yet"
            description="Build a priced quote and share the link with an agent."
            action={<Link href="/dashboard/quotes/new" className="btn-primary">New quote</Link>}
          />
        }
        error={error?.message ?? null}
      />
    </div>
  );
}
