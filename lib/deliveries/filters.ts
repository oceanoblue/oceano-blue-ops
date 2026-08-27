import { DELIVERY_STATUSES, DELIVERY_TYPES } from './constants';

export type DeliveryFilters = { status: string | null; type: string | null; client: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize Next.js `searchParams` into a validated filter pair.
 * Values are kept only when they are a known status/type; anything else
 * (missing, "all", an unknown string, or an array) collapses to null, so a
 * hand-edited URL can never inject an arbitrary value into the query.
 */
export function parseDeliveryFilters(
  params: Record<string, string | string[] | undefined> | undefined,
): DeliveryFilters {
  const rawClient = Array.isArray(params?.client) ? params?.client[0] : params?.client;
  return {
    status: pick(params?.status, DELIVERY_STATUSES),
    type: pick(params?.type, DELIVERY_TYPES),
    // client is a dynamic id, so validate shape (uuid) rather than a fixed list.
    client: rawClient && UUID_RE.test(rawClient) ? rawClient : null,
  };
}

function pick(raw: string | string[] | undefined, allowed: string[]): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && allowed.includes(value) ? value : null;
}

/**
 * Build a querystring (including leading "?") for the deliveries page from a
 * filter pair, dropping null/empty values. Used to render filter links that
 * preserve whichever other filter is active. Returns "" when no filters are set.
 */
export function buildDeliveryQuery(filters: Partial<DeliveryFilters>): string {
  const qs = new URLSearchParams();
  if (filters.status) qs.set('status', filters.status);
  if (filters.type) qs.set('type', filters.type);
  if (filters.client) qs.set('client', filters.client);
  const s = qs.toString();
  return s ? `?${s}` : '';
}
