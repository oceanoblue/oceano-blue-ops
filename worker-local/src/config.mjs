import os from 'node:os';
import path from 'node:path';

// Configuration is entirely env-driven; no secrets are committed.
//   POS_BASE_URL      e.g. https://app.oceanoblue.net   (required)
//   WORKER_API_KEY    the `obw_...` key from registration  (required)
//   WORKER_ROOTS      comma-separated allowlist of root dirs the worker may read
//   WORKER_NAME       display name (default: hostname)
//   WORKER_STORAGE_KIND  local|nas|external_drive (default: local)
//   POLL_INTERVAL_MS  default 15000
//   CLAIM_MAX         tasks per poll (default 2)

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

export const config = {
  baseUrl: required('POS_BASE_URL').replace(/\/+$/, ''),
  apiKey: required('WORKER_API_KEY'),
  roots: (process.env.WORKER_ROOTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p)),
  name: process.env.WORKER_NAME ?? os.hostname(),
  storageKind: process.env.WORKER_STORAGE_KIND ?? 'local',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 15000),
  claimMax: Number(process.env.CLAIM_MAX ?? 2),
  capabilities: ['scan_folder', 'generate_thumbnails'],
};

if (config.roots.length === 0) {
  console.error('[config] WORKER_ROOTS is empty — refusing to run without an explicit allowlist.');
  process.exit(1);
}
