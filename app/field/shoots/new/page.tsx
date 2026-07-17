import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalHero } from '@/components/portal/PortalHero';
import { NewShootForm } from '@/components/field/NewShootForm';

export const dynamic = 'force-dynamic';

export default async function NewFieldShootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/field');

  const { data: me } = await supabase
    .from('contractors')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!me) redirect('/field/shoots');

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="New shoot"
        title="Log a property"
        subtitle="Add the address and details. You’ll get an upload folder on the next screen."
        backHref="/field/shoots"
        backLabel="My shoots"
      />
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8">
        <div className="card p-5 sm:p-6">
          <NewShootForm />
        </div>
      </main>
    </div>
  );
}
