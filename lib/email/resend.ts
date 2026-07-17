/**
 * Transactional email via Resend (https://resend.com). Kept dependency-free —
 * a single REST call — so there's nothing to install or keep in sync.
 *
 * Env:
 *   RESEND_API_KEY   — required to send (absent → 'not_configured', mirrors the
 *                      Dropbox integration's fail-soft behaviour).
 *   EMAIL_FROM       — From header, e.g. "Oceano Blue <noreply@oceanoblue.net>".
 *                      Must be a Resend-verified domain in production.
 *   EMAIL_REPLY_TO   — optional Reply-To (e.g. the office inbox).
 */

export type EmailResult =
  | { status: 'sent'; id: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function defaultFrom(): string {
  return process.env.EMAIL_FROM || 'Oceano Blue <noreply@oceanoblue.net>';
}

// Where replies to platform email go. Overridable per-send or via EMAIL_REPLY_TO.
export function defaultReplyTo(): string {
  return process.env.EMAIL_REPLY_TO || 'info@oceanoblue.net';
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}): Promise<EmailResult> {
  if (!isEmailConfigured()) return { status: 'not_configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from || defaultFrom(),
        to: [params.to],
        subject: params.subject,
        html: params.html,
        reply_to: params.replyTo || defaultReplyTo(),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return { status: 'failed', error: body.message || `resend_${res.status}` };
    }
    return { status: 'sent', id: body.id ?? '' };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'email_error' };
  }
}
