import { config } from './config.mjs';

// Thin HTTP client for the Production OS worker API. Auth = Bearer worker key.

async function post(pathname, body) {
  const res = await fetch(`${config.baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`POST ${pathname} -> ${res.status} ${json.error ?? ''}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  heartbeat: () =>
    post('/api/worker/heartbeat', { capabilities: config.capabilities, metadata: { roots: config.roots } }),
  claim: () => post('/api/worker/tasks/claim', { max: config.claimMax }),
  result: (payload) => post('/api/worker/tasks/result', payload),
};
