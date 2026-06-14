/**
 * Guard for post-auth redirects. A `?next=` parameter that flows into
 * NextResponse.redirect is an open-redirect vector if it isn't constrained to
 * the same site — `new URL(next, base)` happily accepts absolute URLs like
 * `https://evil.com` or scheme-relative `//evil.com`. Only allow same-origin
 * absolute paths (a single leading slash), otherwise fall back.
 */
export function safeRelativePath(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  // Must be a path starting with exactly one slash. Reject protocol-relative
  // ("//host"), backslash tricks ("/\\host"), and any scheme/host form.
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // Defense in depth: anything that parses to a different origin is rejected.
  try {
    const u = new URL(next, 'https://oceano.invalid');
    if (u.origin !== 'https://oceano.invalid') return fallback;
  } catch {
    return fallback;
  }
  return next;
}
