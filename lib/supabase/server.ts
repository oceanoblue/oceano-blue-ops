import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// @supabase/ssr@0.5.x's createServerClient returns a client whose write methods
// degrade to `never` against @supabase/supabase-js@2.106 (stale generic
// plumbing). The runtime object IS a real SupabaseClient, so we annotate the
// factory return as the correctly-typed supabase-js SupabaseClient<Database> —
// restoring strict insert/update typing with zero runtime change.
export function createClient(): SupabaseClient<Database> {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component, ignore
          }
        },
      },
    }
  ) as unknown as SupabaseClient<Database>;
}

/**
 * Admin client for server-only operations that need to bypass RLS
 * (AI job processing, system tasks). NEVER expose this to the browser.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  ) as unknown as SupabaseClient<Database>;
}
