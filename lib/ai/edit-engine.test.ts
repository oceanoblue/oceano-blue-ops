import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFrames } from './edit-engine';

describe('extractFrames', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.EDIT_ENGINE_URL = 'https://engine.test/';
    process.env.EDIT_WORKER_SECRET = 'shh';
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it('posts JSON to /frames with the secret and decodes base64 frames', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ duration: 12.5, frames: [{ index: 1, t: 0.6, jpeg_b64: Buffer.from('abc').toString('base64') }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await extractFrames('https://dl.dropboxusercontent.com/x.mp4', { count: 5, longEdge: 640 });

    expect(out.duration).toBe(12.5);
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0].bytes.toString()).toBe('abc');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://engine.test/frames');
    expect((init.headers as Record<string, string>)['x-edit-secret']).toBe('shh');
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://dl.dropboxusercontent.com/x.mp4', count: 5, long_edge: 640 });
  });

  it('throws a status-tagged error on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('probe_failed: 403', { status: 502 })));
    await expect(extractFrames('https://x/y.mp4')).rejects.toThrow('edit_engine_502: probe_failed: 403');
  });

  it('throws when unconfigured', async () => {
    delete process.env.EDIT_ENGINE_URL;
    await expect(extractFrames('https://x/y.mp4')).rejects.toThrow('edit_engine_not_configured');
  });
});
