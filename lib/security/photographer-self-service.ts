// Exact paths only. Each handler independently enforces the signed-in member's
// identity; this exception never opens office pages or administrator routing.
export function photographerSelfServicePath(pathname: string) {
  return ['/api/scheduling/hours','/api/scheduling/time-off','/api/auth/google/connect','/api/auth/google/callback','/api/auth/google/disconnect'].includes(pathname);
}
