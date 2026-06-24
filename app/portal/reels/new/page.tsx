import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalHero } from '@/components/portal/PortalHero';
import { ReelIntakeWizard } from '@/components/portal/ReelIntakeWizard';

export const dynamic = 'force-dynamic';

export default async function NewReelPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal');

  // The wizard uploads footage into the client's own storage prefix, so it
  // needs the caller's client_id. current_client_id() is the same helper RLS
  // uses — null means the account isn't linked to a client row yet.
  const { data: clientId } = await supabase.rpc('current_client_id');

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="New reel"
        title="Create a reel"
        subtitle="Upload your footage and tell us how you want it cut. Our team takes it from there."
        backHref="/portal/reels"
        backLabel="Reels"
      />
      {clientId ? (
        <ReelIntakeWizard clientId={clientId} />
      ) : (
        <div className="mx-auto max-w-xl px-6 py-12">
          <div className="card p-6 text-center">
            <h2 className="font-display text-lg font-semibold text-ocean-950">
              Account not linked yet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              We couldn&apos;t match your sign-in to a client account. Please contact us so we
              can finish setting up your portal.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
