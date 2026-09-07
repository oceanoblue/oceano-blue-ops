import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public at the middleware (page-auth) layer. These either serve unauthenticated
// pages or are server-to-server API routes that enforce their OWN auth inside
// the handler (worker Bearer key / shared secret), so the cookie-based login
// redirect must not apply to them — otherwise a server POST gets 307-redirected
// to /login and fails with 405.
const PUBLIC_PATHS = [
  '/', '/book', '/login', '/gallery', '/portal',
  '/auth',             // magic-link / OAuth code-exchange callback — must be
                       // reachable BEFORE a session exists, or login can't complete.
  '/quote',            // shareable client quote pages (SSR, token-gated)
  '/guides',           // static onboarding guides — meant to be shared publicly
  '/field',            // contractor portal — self-guards in its server components
  '/api/delivery', '/api/booking', '/api/portal',
  '/api/field',        // contractor API — re-derives contractor via session + RLS
  '/api/products', '/api/availability', '/api/places',
  '/api/worker',       // local worker API — authenticates via Bearer worker key
  '/api/automations',  // Make.com bridge — authenticates via x-pos-automation-secret
  '/api/cron',         // background job worker — authenticates via Bearer CRON_SECRET
  '/api/stripe',       // Stripe webhook — authenticates via signature verification
];

// Routes that live UNDER a public prefix above but are NOT actually public — they
// expect a logged-in STAFF user (session), not a Bearer/secret. The prefix makes
// the middleware wave them through, so they enforce staff in-handler AND are
// re-gated here. Keep in sync with the in-handler requireTeamMember() checks.
const STAFF_ONLY_UNDER_PUBLIC = [
  '/api/worker/register',            // mints a worker key — staff only
  '/api/automations/podcast/approve',// human publish gate — staff only
  '/api/automations/make/trigger',   // fires the Make pipeline — staff only
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const staffOnlyException = STAFF_ONLY_UNDER_PUBLIC.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  // Public routes don't require auth (unless they're a staff-only exception
  // that merely lives under a public prefix).
  if (isPublic(pathname) && !staffOnlyException) return response;

  // Must be signed in.
  if (!user) {
    // API callers get a clean 401; page requests bounce to login.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Signed in, but office routes require OFFICE STAFF. Contractors and clients
  // are in the same auth pool and only ever use the public-prefixed /field,
  // /portal, /api/field, /api/portal, /api/delivery routes — so a non-staff
  // session reaching here is either a mistyped URL or an attempt to hit an
  // office endpoint by id. Each member can read their own team_members row
  // (RLS "self select"), which also tells us their role.
  const { data: me } = await supabase
    .from('team_members')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  const isStaff = Boolean(me?.is_active);
  if (!isStaff) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    // Non-staff on an office page → send them to the public home.
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Photographers are field, not office. Their team_members row exists for
  // scheduling (availability, double-book guard, calendar) — not so they can
  // browse every order, client, and price. Send them to their own portal,
  // which shows only the shoots assigned to them.
  if (me?.role === 'photographer') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/field/shoots';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
