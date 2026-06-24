import { createHash, randomBytes } from 'crypto';

/**
 * Local Worker authentication helpers.
 *
 * Local/NAS workers authenticate to the Production OS worker API with a
 * per-worker API key (Bearer token). Only the SHA-256 hash is stored
 * (`local_workers.api_key_hash`); the plaintext key is shown to the operator
 * exactly once at registration. The Supabase service-role key never leaves the
 * server — workers only ever hold their own scoped key.
 */

const PREFIX = 'obw_'; // Oceano Blue Worker

/** Every task type the server dispatches — the only capabilities a worker may claim. */
export const WORKER_CAPS = ['scan_folder', 'generate_thumbnails', 'process_photos'] as const;

export function hashWorkerKey(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex');
}

export function generateWorkerKey(): { key: string; hash: string; prefix: string } {
  const key = PREFIX + randomBytes(32).toString('base64url');
  return { key, hash: hashWorkerKey(key), prefix: key.slice(0, 12) };
}

/** Pull the Bearer token from an Authorization header. */
export function bearerFromRequest(request: Request): string | null {
  const h = request.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export interface WorkerRow {
  id: string;
  name: string;
  capabilities: string[];
  status: string;
}

/**
 * Authenticate a worker request. `admin` is a service-role Supabase client.
 * Returns the worker row or null (caller responds 401).
 */
export async function authenticateWorker(request: Request, admin: any): Promise<WorkerRow | null> {
  const token = bearerFromRequest(request);
  if (!token) return null;
  const { data } = await admin
    .from('local_workers')
    .select('id, name, capabilities, status')
    .eq('api_key_hash', hashWorkerKey(token))
    .maybeSingle();
  return (data as WorkerRow) ?? null;
}
