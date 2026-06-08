import { config } from './config.mjs';
import { api } from './api.mjs';
import { handleScan } from './scan.mjs';
import { handleThumbnails } from './thumbnail.mjs';

// Oceano Blue local worker — heartbeat → claim → execute → report, on a loop.
// Read-only on disk; only ever touches paths inside WORKER_ROOTS.

const HANDLERS = {
  scan_folder: handleScan,
  generate_thumbnails: handleThumbnails,
};

let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runTask(task) {
  const handler = HANDLERS[task.task_type];
  if (!handler) {
    return { task_id: task.id, status: 'failed', error: `unsupported task_type: ${task.task_type}` };
  }
  try {
    return await handler(task);
  } catch (e) {
    return { task_id: task.id, status: 'failed', error: e?.message ?? 'handler_error' };
  }
}

async function tick() {
  await api.heartbeat();
  const { tasks } = await api.claim();
  if (!tasks || tasks.length === 0) return 0;
  for (const task of tasks) {
    console.log(`[worker] running ${task.task_type} (${task.id})`);
    const result = await runTask(task);
    try {
      await api.result(result);
      console.log(`[worker] ${task.task_type} -> ${result.status}`, result.result ?? {});
    } catch (e) {
      console.error(`[worker] failed to post result for ${task.id}:`, e?.message ?? e);
    }
  }
  return tasks.length;
}

console.log(`[worker] "${config.name}" starting → ${config.baseUrl}`);
console.log(`[worker] roots: ${config.roots.join(', ')}`);
console.log(`[worker] capabilities: ${config.capabilities.join(', ')}`);

while (running) {
  try {
    await tick();
  } catch (e) {
    console.error('[worker] loop error:', e?.message ?? e);
    if (e?.status === 401) {
      console.error('[worker] 401 — check WORKER_API_KEY. Exiting.');
      process.exit(1);
    }
  }
  await sleep(config.pollIntervalMs);
}

console.log('[worker] shutting down.');
