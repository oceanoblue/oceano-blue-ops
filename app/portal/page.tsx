import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { homeForUser } from '@/lib/auth/home-for-user';
import { PortalSignIn } from '@/components/portal/PortalSignIn';

export const dynamic = 'force-dynamic';

/**
 * The front door — also what the installed home-screen app opens. Already
 * signed in? Go straight to YOUR portal (office, field, or client), whichever
 * that is. Otherwise, the magic-link sign-in.
 */
export default async function PortalLanding() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const home = await homeForUser(supabase, user.id);
    if (home) redirect(home);
  }
  return <PortalSignIn />;
}
