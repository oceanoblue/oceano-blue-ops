import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { showFolderPath, isDropboxConfigured, headerSafeJson } from './dropbox';

describe('showFolderPath', () => {
  it('joins the default root with the slug', () => {
    expect(showFolderPath('defining-wealth', '/Podcasts')).toBe('/Podcasts/defining-wealth');
  });

  it('normalizes missing leading slash and trailing slash on the root', () => {
    expect(showFolderPath('mind-your-health', 'Podcasts/')).toBe('/Podcasts/mind-your-health');
  });

  it('collapses duplicate slashes', () => {
    expect(showFolderPath('x', '//Clients//Podcasts//')).toBe('/Clients/Podcasts/x');
  });

  it('strips stray slashes around the slug', () => {
    expect(showFolderPath('/foo/', '/Podcasts')).toBe('/Podcasts/foo');
  });
});

describe('isDropboxConfigured', () => {
  const keys = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'];
  afterEach(() => keys.forEach((k) => delete process.env[k]));

  it('false when nothing is set', () => {
    expect(isDropboxConfigured()).toBe(false);
  });

  it('false when only some are set', () => {
    process.env.DROPBOX_APP_KEY = 'a';
    expect(isDropboxConfigured()).toBe(false);
  });

  it('true when all three are set', () => {
    process.env.DROPBOX_APP_KEY = 'a';
    process.env.DROPBOX_APP_SECRET = 'b';
    process.env.DROPBOX_REFRESH_TOKEN = 'c';
    expect(isDropboxConfigured()).toBe(true);
  });
});

describe('headerSafeJson', () => {
  it('escapes non-ASCII so the value is legal in an HTTP header', () => {
    const out = headerSafeJson({ path: '/Podcasts/Mind Your Health/señor.jpg', mode: 'overwrite' });
    expect(out).toBe('{"path":"/Podcasts/Mind Your Health/se\\u00f1or.jpg","mode":"overwrite"}');
    expect(/[^\x00-\x7f]/.test(out)).toBe(false);
  });
});

describe('team-root fallback', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.DROPBOX_APP_KEY = 'k';
    process.env.DROPBOX_APP_SECRET = 's';
    process.env.DROPBOX_REFRESH_TOKEN = 'r';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  type Call = { url: string; headers: Record<string, string> };

  /**
   * A fetch stub that dispatches on URL, mirroring real Dropbox behavior:
   * - oauth2/token always succeeds
   * - users/get_current_account reports a team-space account (or fails, per opts)
   * - files/get_temporary_link and files/upload 409 path/not_found unless the
   *   request carries Dropbox-API-Path-Root, in which case they succeed
   *   (unless `tempLinkConflict`, which always 409s with path/conflict instead)
   */
  function stubFetch(
    opts: { getCurrentAccountStatus?: number; tempLinkConflict?: boolean } = {}
  ): { fetchMock: ReturnType<typeof vi.fn>; calls: Call[] } {
    const { getCurrentAccountStatus = 200, tempLinkConflict = false } = opts;
    const calls: Call[] = [];

    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      calls.push({ url, headers });

      if (url.includes('oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 14400 }), { status: 200 });
      }
      if (url.includes('users/get_current_account')) {
        if (getCurrentAccountStatus !== 200) return new Response('server error', { status: getCurrentAccountStatus });
        return new Response(
          // Production shape: Dropbox tags a team-space member "user" yet reports a distinct root namespace.
          JSON.stringify({ root_info: { '.tag': 'user', home_path: '/Member', root_namespace_id: '111', home_namespace_id: '222' } }),
          { status: 200 }
        );
      }
      if (url.includes('files/get_temporary_link')) {
        if (tempLinkConflict) {
          return new Response(JSON.stringify({ error_summary: 'path/conflict/...' }), { status: 409 });
        }
        if (headers['Dropbox-API-Path-Root']) {
          return new Response(JSON.stringify({ link: 'https://dl/x' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error_summary: 'path/not_found/...' }), { status: 409 });
      }
      if (url.includes('files/upload')) {
        if (headers['Dropbox-API-Path-Root']) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify({ error_summary: 'path/not_found/...' }), { status: 409 });
      }
      throw new Error(`unexpected fetch url in test stub: ${url}`);
    });

    return { fetchMock, calls };
  }

  it('a. resolves getTemporaryLink after learning the team root namespace, retrying with the Path-Root header', async () => {
    const { fetchMock, calls } = stubFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { getTemporaryLink } = await import('./dropbox');

    const link = await getTemporaryLink('/Podcasts/x.mp4');

    expect(link).toBe('https://dl/x');
    expect(calls.filter((c) => c.url.includes('users/get_current_account'))).toHaveLength(1);
    const successCall = calls.filter((c) => c.url.includes('files/get_temporary_link')).at(-1)!;
    expect(successCall.headers['Dropbox-API-Path-Root']).toBe('{".tag":"root","root":"111"}');
  });

  it('b. caches the team root namespace across calls in the same module instance', async () => {
    const { fetchMock, calls } = stubFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { getTemporaryLink } = await import('./dropbox');

    await getTemporaryLink('/Podcasts/x.mp4');
    await getTemporaryLink('/Podcasts/y.mp4');

    expect(calls.filter((c) => c.url.includes('users/get_current_account'))).toHaveLength(1);
  });

  it('c. preserves the original path/not_found error when get_current_account fails, with no extra retry', async () => {
    const { fetchMock, calls } = stubFetch({ getCurrentAccountStatus: 500 });
    vi.stubGlobal('fetch', fetchMock);
    const { getTemporaryLink } = await import('./dropbox');

    await expect(getTemporaryLink('/Podcasts/x.mp4')).rejects.toThrow(/dropbox_temp_link_409: path\/not_found/);

    expect(calls.filter((c) => c.url.includes('files/get_temporary_link'))).toHaveLength(1);
  });

  it('d. retries uploadFile against the team root, preserving Content-Type and Dropbox-API-Arg', async () => {
    const { fetchMock, calls } = stubFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { uploadFile } = await import('./dropbox');

    const result = await uploadFile('/Podcasts/x.jpg', Buffer.from('a'));

    expect(result).toEqual({ status: 'ok' });
    const uploadCalls = calls.filter((c) => c.url.includes('files/upload'));
    expect(uploadCalls).toHaveLength(2);
    const retry = uploadCalls[1];
    expect(retry.headers['Content-Type']).toBe('application/octet-stream');
    expect(retry.headers['Dropbox-API-Arg']).toBeTruthy();
    expect(retry.headers['Dropbox-API-Path-Root']).toBe('{".tag":"root","root":"111"}');
  });

  it('e. does not retry a path/conflict 409', async () => {
    const { fetchMock, calls } = stubFetch({ tempLinkConflict: true });
    vi.stubGlobal('fetch', fetchMock);
    const { getTemporaryLink } = await import('./dropbox');

    await expect(getTemporaryLink('/Podcasts/x.mp4')).rejects.toThrow(/dropbox_temp_link_409: path\/conflict/);

    expect(calls.filter((c) => c.url.includes('files/get_temporary_link'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('users/get_current_account'))).toHaveLength(0);
  });

  it('f. sandbox (App-Folder) app: the Path-Root retry 400s, so the original 409 (path/not_found) is preserved and the retry is disabled for the rest of the process', async () => {
    const calls: Call[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      calls.push({ url, headers });

      if (url.includes('oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 14400 }), { status: 200 });
      }
      if (url.includes('users/get_current_account')) {
        return new Response(
          JSON.stringify({ root_info: { '.tag': 'user', root_namespace_id: '111', home_namespace_id: '222' } }),
          { status: 200 }
        );
      }
      if (url.includes('files/get_temporary_link')) {
        if (headers['Dropbox-API-Path-Root']) {
          return new Response(
            JSON.stringify({
              error_summary: 'path_root/...',
              error: { '.tag': 'path_root' },
              error_message: 'path root is not supported for sandbox app',
            }),
            { status: 400 }
          );
        }
        return new Response(JSON.stringify({ error_summary: 'path/not_found/...' }), { status: 409 });
      }
      throw new Error(`unexpected fetch url in test stub: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getTemporaryLink } = await import('./dropbox');

    await expect(getTemporaryLink('/Podcasts/x.mp4')).rejects.toThrow(/dropbox_temp_link_409: path\/not_found/);

    // Second call: retry must stay disabled — no fresh get_current_account, no Path-Root request.
    await expect(getTemporaryLink('/Podcasts/y.mp4')).rejects.toThrow(/dropbox_temp_link_409: path\/not_found/);

    expect(calls.filter((c) => c.url.includes('users/get_current_account'))).toHaveLength(1);
    expect(calls.filter((c) => c.headers['Dropbox-API-Path-Root'])).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('files/get_temporary_link'))).toHaveLength(3);
  });
});
