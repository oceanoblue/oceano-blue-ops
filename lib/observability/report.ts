/**
 * Single error-capture seam for the app + serverless routes.
 *
 * Today it emits one structured JSON line per error to stderr — captured by
 * Vercel/Fly logs, so failures are greppable and alertable instead of silent
 * (the audit found only ~6 bare console.error calls and no aggregation). It is
 * deliberately the ONE place to forward to Sentry/Datadog later: drop the SDK
 * call into captureError() once a DSN is configured, and every call site is
 * already wired.
 */
export type Fields = Record<string, unknown>;

export function captureError(scope: string, err: unknown, context: Fields = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  try {
    console.error(
      JSON.stringify({
        level: 'error',
        scope,
        message,
        ...context,
        stack,
        ts: new Date().toISOString(),
      })
    );
  } catch {
    // Never let logging throw.
    console.error(`[${scope}] ${message}`);
  }
  // TODO(observability): when SENTRY_DSN is set, forward { scope, err, context } here.
}

export function logEvent(scope: string, event: string, fields: Fields = {}): void {
  try {
    console.log(
      JSON.stringify({ level: 'info', scope, event, ...fields, ts: new Date().toISOString() })
    );
  } catch {
    /* noop */
  }
}
