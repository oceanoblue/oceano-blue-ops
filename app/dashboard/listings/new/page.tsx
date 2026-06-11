import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { NewListingForm } from '@/components/listings/NewListingForm';

export const dynamic = 'force-dynamic';

export default async function NewListingPage() {
  const supabase = createClient();
  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, brokerage')
    .eq('is_archived', false)
    .order('full_name');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/listings" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to listings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ocean-950">New listing</h1>
        <p className="text-sm text-slate-600">
          Start a property by address, then add a photo order from the listing page.
        </p>
      </div>
      <NewListingForm clients={(clients ?? []) as any} />
    </div>
  );
}
