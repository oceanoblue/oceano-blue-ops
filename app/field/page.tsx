import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { homeForUser } from '@/lib/auth/home-for-user';
import { FieldSignIn } from '@/components/field/FieldSignIn';

export const dynamic = 'force-dynamic';

/** Photographer front door. Signed in already? Straight to your shoots. */
export default async function FieldLanding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const home = await homeForUser(supabase, user.id);
    if (home) redirect(home);
  }
  return <FieldSignIn />;
}
