import type { AiProvider, AiRequest, AiResponse, SourceImage } from '../types';
import { oceanoEnhance } from '../oceano-enhance';

/**
 * Autoenhance.ai provider.
 *
 * The v3 API is async:
 *   1. POST /v3/images/ to register and receive a signed S3 upload_url
 *   2. PUT the image bytes to upload_url with Content-Type: application/octet-stream
 *   3. Poll GET /v3/images/{image_id} until { enhanced: true }
 *   4. GET /v3/images/{image_id}/enhanced?preview=false for the final URL
 *
 * The free-tier turnaround is usually 5–30 seconds per image. Our runner is
 * synchronous, so we poll inline with backoff. Set AUTOENHANCE_DEV_MODE=true
 * in env to test against your account without burning credits.
 *
 * Heads up: Autoenhance is single-image-first. Their bracket-merge product
 * exists but uses a different ingestion flow; for now hdr_merge falls back
 * to our internal Oceano Enhance exposure fusion.
 */
const BASE = 'https://api.autoenhance.ai/v3';
const POLL_INITIAL_MS = 1500;
const POLL_MAX_MS = 6000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function devModeHeader() {
  return process.env.AUTOENHANCE_DEV_MODE === 'true' ? { 'x-dev-mode': 'true' } : {};
}

interface RegisterImageResponse {
  upload_url: string;
  order_id: string;
  image_id: string;
}

async function registerImage(apiKey: string, name: string): Promise<RegisterImageResponse> {
  const r = await fetch(`${BASE}/images/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      ...devModeHeader(),
    },
    body: JSON.stringify({ image_name: name }),
  });
  if (!r.ok) {
    throw new Error(`Autoenhance register failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

async function uploadImage(uploadUrl: string, apiKey: string, bytes: Buffer): Promise<void> {
  const r = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      'x-api-key': apiKey,
    },
    body: bytes,
  });
  if (!r.ok) {
    throw new Error(`Autoenhance upload failed: ${r.status} ${await r.text()}`);
  }
}

async function waitForEnhanced(imageId: string, apiKey: string): Promise<void> {
  const start = Date.now();
  let delay = POLL_INITIAL_MS;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const r = await fetch(`${BASE}/images/${imageId}`, {
      headers: { 'x-api-key': apiKey, ...devModeHeader() },
    });
    if (r.ok) {
      const data = await r.json();
      if (data?.error) {
        throw new Error(`Autoenhance reported error: ${JSON.stringify(data.error)}`);
      }
      if (data?.enhanced === true || data?.status === 'processed') return;
    }
    await new Promise((res) => setTimeout(res, delay));
    delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.4));
  }
  throw new Error(`Autoenhance timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

async function downloadEnhanced(imageId: string, apiKey: string): Promise<Buffer> {
  // First call returns { image_url } pointing at signed CDN url.
  const meta = await fetch(`${BASE}/images/${imageId}/enhanced?preview=false`, {
    headers: { 'x-api-key': apiKey, ...devModeHeader() },
  });
  if (!meta.ok) {
    throw new Error(`Autoenhance download URL failed: ${meta.status} ${await meta.text()}`);
  }
  const data = await meta.json();
  const url: string | undefined = data?.image_url || data?.url;
  if (!url) {
    throw new Error(`Autoenhance returned no download URL: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const file = await fetch(url);
  if (!file.ok) {
    throw new Error(`Autoenhance CDN fetch failed: ${file.status}`);
  }
  return Buffer.from(await file.arrayBuffer());
}

async function bufFromSource(src: SourceImage): Promise<Buffer> {
  if (src.bytes) return Buffer.isBuffer(src.bytes) ? src.bytes : Buffer.from(src.bytes);
  if (src.url) {
    const r = await fetch(src.url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`Source ${src.filename} has no bytes or url`);
}

export const autoenhance: AiProvider = {
  id: 'autoenhance',
  displayName: 'Autoenhance.ai',
  supports: [
    'enhance_single',
    // hdr_merge intentionally not listed — we fall back internally
    'sky_replace',
    'window_pull',
    'lawn_enhance',
    'declutter',
    'twilight_convert',
  ],

  isConfigured() {
    // hdr_merge falls back to Oceano internally, but the API path needs a key.
    return Boolean(process.env.AUTOENHANCE_API_KEY);
  },

  estimatedCostCents() {
    // Approximate credit cost across plans ≈ €0.10–0.20 / image depending on
    // plan tier. Use 10¢ as a planning number.
    return 10;
  },

  async process(req: AiRequest): Promise<AiResponse> {
    // HDR bracket merging is handled by our internal pipeline, since the
    // Autoenhance bracket flow has a different ingestion pattern. Single-shot
    // through their API is exactly what they're best at.
    if (req.jobType === 'hdr_merge') {
      return oceanoEnhance.process(req);
    }

    const apiKey = process.env.AUTOENHANCE_API_KEY;
    if (!apiKey) throw new Error('AUTOENHANCE_API_KEY is not set');

    if (req.inputs.length === 0) {
      throw new Error('At least one input image is required');
    }

    const src = req.inputs[0];
    const bytes = await bufFromSource(src);

    // 1. Register
    const reg = await registerImage(apiKey, src.filename);

    // 2. Upload
    await uploadImage(reg.upload_url, apiKey, bytes);

    // 3. Poll until processed
    await waitForEnhanced(reg.image_id, apiKey);

    // 4. Download result
    const out = await downloadEnhanced(reg.image_id, apiKey);

    return {
      outputs: [
        {
          bytes: out,
          mimeType: 'image/jpeg',
          filename: `${req.jobType}-${Date.now()}.jpg`,
        },
      ],
      model: `autoenhance/${reg.image_id}`,
      costCents: autoenhance.estimatedCostCents(req),
      rawPromptUsed: '(autoenhance.ai pipeline)',
      notes: `image_id=${reg.image_id} order_id=${reg.order_id}`,
    };
  },
};
