import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { NewShootForm } from '@/components/orders/NewShootForm';

export const dynamic = 'force-dynamic';

/**
 * "New shoot" — the one-screen fast path for manually arranged shoots. Creates
 * client + listing + order + assignment (and, for contractors, the Dropbox
 * upload link) in a single submit, replacing the old client→listing→order→assign
 * chain across four screens.
 */
export default async function NewShootPage() {
  const supabase = createClient();

  const [{ data: clients }, { data: contractorRows }, { data: team }, { data: productRows }] =
    await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, brokerage')
        .eq('is_archived', false)
        .order('full_name'),
      supabase
        .from('contractors')
        .select('id, full_name, pay_rate_cents')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('team_members')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('products')
        .select('id, name, kind, is_addon, base_price_cents, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
    ]);

  const photographers = ((team ?? []) as any[])
    .filter((t) => t.role === 'photographer' || t.role === 'admin')
    .map((t) => ({ id: t.id, full_name: t.full_name }));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/dashboard/orders" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ocean-100 text-ocean-700">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ocean-950">New shoot</h1>
            <p className="text-sm text-slate-600">
              Client, property, photographer and upload link — all in one step.
            </p>
          </div>
        </div>
      </div>

      <NewShootForm
        clients={(clients ?? []) as any}
        contractors={(contractorRows ?? []) as any}
        team={photographers}
        products={(productRows ?? []) as any}
      />
    </div>
  );
}
