import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public at the middleware (page-auth) layer. These either serve unauthenticated
// pages or are server-to-server API routes that enforce their OWN auth inside
// the handler (worker Bearer key / shared secret), so the cookie-based login
// redirect must not apply to them — otherwise a server POST gets 307-redirected
// to /login and fails with 405.
const PUBLIC_PATHS = [
  '/', '/book', '/login', '/gallery', '/portal',
  '/api/delivery', '/api/booking', '/api/portal',
  '/api/products', '/api/availability',
  '/api/worker',       // local worker API — authenticates via Bearer worker key
  '/api/automations',  // Make.com bridge — authenticates via x-pos-automation-secret
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
        setAll(cookiesToSet) {
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

  // Public routes don't require auth
  if (isPublic(pathname)) return response;

  // Everything else requires an authenticated team member
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
