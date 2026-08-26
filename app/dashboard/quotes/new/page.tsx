import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { QuoteBuilder } from '@/components/quotes/QuoteBuilder';

export const dynamic = 'force-dynamic';

export default async function NewQuotePage() {
  const supabase = createClient();
  const { data: products } = await supabase
    .from('products')
    .select('slug, name, is_addon, base_price_cents, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/dashboard/quotes" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Quotes
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ocean-100 text-ocean-700">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ocean-950">New quote</h1>
            <p className="text-sm text-slate-600">Price a property and share a link — bundling is applied automatically.</p>
          </div>
        </div>
      </div>
      <QuoteBuilder products={(products ?? []) as any} />
    </div>
  );
}
