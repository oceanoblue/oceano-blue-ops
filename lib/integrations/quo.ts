/**
 * Transactional SMS via Quo (formerly OpenPhone) — https://www.quo.com/api.
 * Kept dependency-free (a single REST call) and fail-soft, mirroring the Resend
 * and Dropbox integrations: if it isn't configured, callers get 'not_configured'
 * instead of an error, so notifications degrade gracefully.
 *
 * Env (Quo names, with the pre-rebrand OpenPhone names accepted as aliases so an
 * existing key keeps working):
 *   QUO_API_KEY      (or OPENPHONE_API_KEY)      — required. Sent verbatim in the
 *                                                  Authorization header (NOT Bearer).
 *   QUO_SMS_FROM     (or QUO_PHONE_NUMBER /
 *                     OPENPHONE_FROM /
 *                     OPENPHONE_NUMBER)          — required. The Quo number to send
 *                                                  from, in E.164 (e.g. +18435551234).
 *   QUO_USER_ID      (optional)                  — only needed for shared numbers.
 *   QUO_API_BASE     (optional)                  — defaults to https://api.quo.com/v1.
 */

export type SmsResult =
  | { status: 'sent'; id: string }
  | { status: 'not_configured' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

function apiKey(): string {
  return process.env.QUO_API_KEY || process.env.OPENPHONE_API_KEY || '';
}
function fromNumber(): string {
  return (
    process.env.QUO_SMS_FROM ||
    process.env.QUO_PHONE_NUMBER ||
    process.env.OPENPHONE_FROM ||
    process.env.OPENPHONE_NUMBER ||
    ''
  );
}
function apiBase(): string {
  return (process.env.QUO_API_BASE || 'https://api.quo.com/v1').replace(/\/$/, '');
}

export function isSmsConfigured(): boolean {
  return Boolean(apiKey() && fromNumber());
}

/**
 * Best-effort E.164 normalization for US/CA numbers (the business is US-based).
 * Returns null when it can't be confidently normalized, so we skip rather than
 * send to a bad number.
 */
export function toE164US(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed; // already E.164
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Send one SMS. `to` is a raw phone string (normalized here). Never throws —
 * returns a tagged result so callers can log without failing their request.
 */
export async function sendSms(params: { to: string | null | undefined; text: string }): Promise<SmsResult> {
  const key = apiKey();
  const from = fromNumber();
  if (!key || !from) {
    console.warn(
      `[quo] SMS not configured — key:${key ? 'set' : 'MISSING'} from:${from ? 'set' : 'MISSING'} (need QUO_API_KEY/OPENPHONE_API_KEY + QUO_SMS_FROM)`
    );
    return { status: 'not_configured' };
  }

  const dest = toE164US(params.to);
  if (!dest) {
    console.warn(`[quo] SMS skipped — couldn't normalize phone: "${params.to}"`);
    return { status: 'skipped', reason: 'no_valid_phone' };
  }

  try {
    const body: Record<string, unknown> = { content: params.text, from, to: [dest] };
    if (process.env.QUO_USER_ID) body.userId = process.env.QUO_USER_ID;

    const res = await fetch(`${apiBase()}/messages`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => '');
      console.error(`[quo] SMS send failed — status ${res.status}, from=${from} to=${dest}, body: ${b.slice(0, 300)}`);
      return { status: 'failed', error: `quo_${res.status}: ${b.slice(0, 200)}` };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string; data?: { id?: string } };
    console.log(`[quo] SMS sent to ${dest} (id: ${j?.data?.id ?? j?.id ?? 'n/a'})`);
    return { status: 'sent', id: j?.data?.id ?? j?.id ?? '' };
  } catch (e: any) {
    console.error(`[quo] SMS error to ${dest}: ${e?.message ?? e}`);
    return { status: 'failed', error: e?.message ?? 'sms_error' };
  }
}
