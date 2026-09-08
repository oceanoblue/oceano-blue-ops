import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fetchBusyRanges, getAccessToken } from './api';
import { refreshAccessToken, GoogleTokenError } from './oauth';
import { createAdminClient } from '@/lib/supabase/server';
vi.mock('@/lib/supabase/server',()=>({createAdminClient:vi.fn()}));
vi.mock('./oauth',async importOriginal => ({...await importOriginal<typeof import('./oauth')>(),refreshAccessToken:vi.fn()}));
let update: ReturnType<typeof vi.fn>;
let row: Record<string, unknown> | null;
beforeEach(() => {
  vi.resetAllMocks();
  row={id:'connection',is_active:true,scope:'https://www.googleapis.com/auth/calendar.readonly',access_token:'test-token',refresh_token:'test-refresh',expires_at:new Date(Date.now()+3600000).toISOString()};
  update=vi.fn();
  const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:row,error:null}),update:(value:any)=>{update(value);return query;}};
  vi.mocked(createAdminClient).mockReturnValue({from:()=>query} as any);
  vi.stubGlobal('fetch',vi.fn());
});
afterEach(()=>vi.unstubAllGlobals());
it('does not treat a failed calendar list request as empty availability', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('{}',{status:403}));
  await expect(fetchBusyRanges('person','2026-09-10T00:00:00Z','2026-09-11T00:00:00Z')).rejects.toThrow('calendar_list_unavailable');
});
it('rejects per-calendar free/busy errors even on HTTP 200', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({items:[{id:'calendar',accessRole:'owner'}]}))
    .mockResolvedValueOnce(Response.json({calendars:{calendar:{errors:[{reason:'forbidden'}]}}}));
  await expect(fetchBusyRanges('person','2026-09-10T00:00:00Z','2026-09-11T00:00:00Z')).rejects.toThrow('calendar_freebusy_incomplete');
});
it('keeps a calendar connection active during a temporary refresh failure', async () => {
  row!.expires_at='2020-01-01T00:00:00Z';
  vi.mocked(refreshAccessToken).mockRejectedValue(new GoogleTokenError('temporarily_unavailable'));
  await expect(getAccessToken('person')).rejects.toThrow('temporarily_unavailable');
  expect(update).not.toHaveBeenCalled();
});
it('marks a revoked token inactive so reconnect is visible', async () => {
  row!.expires_at='2020-01-01T00:00:00Z';
  vi.mocked(refreshAccessToken).mockRejectedValue(new GoogleTokenError('invalid_grant'));
  expect(await getAccessToken('person')).toBeNull();
  expect(update).toHaveBeenCalledWith({is_active:false});
});
it('keeps never-connected photographers on internal availability', async () => {
  row=null;
  expect(await fetchBusyRanges('person','2026-09-10T00:00:00Z','2026-09-11T00:00:00Z')).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
