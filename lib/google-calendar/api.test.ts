import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBusyRanges, fetchMemberBusy, getAccessToken, insertEvent } from './api';
import { refreshAccessToken, GoogleTokenError } from './oauth';
import { createAdminClient } from '@/lib/supabase/server';
vi.mock('@/lib/supabase/server',()=>({createAdminClient:vi.fn()}));
vi.mock('./oauth',async importOriginal => ({...await importOriginal<typeof import('./oauth')>(),refreshAccessToken:vi.fn()}));
let update: ReturnType<typeof vi.fn>;
let row: Record<string, unknown> | null;
let tables: Record<string, any>;
beforeEach(() => {
  vi.resetAllMocks();
  row={id:'connection',is_active:true,scope:'https://www.googleapis.com/auth/calendar.readonly',access_token:'test-token',refresh_token:'test-refresh',expires_at:new Date(Date.now()+3600000).toISOString()};
  tables={team_members:[{id:'person',email:'person@example.com'},{id:'karen',email:'karen@example.com'}],contractors:[],team_calendar_connections:[]};
  update=vi.fn();
  vi.mocked(createAdminClient).mockImplementation(()=>({from:(table:string)=>{
    const filters:[string,unknown][]=[];
    const rows=()=>(tables[table]??[]).filter((r:any)=>filters.every(([k,v])=>r[k]===v));
    const query:any={select:()=>query,eq:(k:string,v:unknown)=>{filters.push([k,v]);return query;},
      maybeSingle:async()=>({data:table==='team_calendar_connections'&&filters.some(([k,v])=>k==='team_member_id'&&v==='person')?row:rows()[0]??null,error:null}),
      update:(value:any)=>{update(value);return query;},then:(resolve:any)=>Promise.resolve({data:rows(),error:null}).then(resolve)};
    return query;
  }}) as any);
  vi.stubGlobal('fetch',vi.fn());
});
afterEach(()=>vi.unstubAllGlobals());
const range=['person','2026-09-25T04:00:00Z','2026-09-27T04:00:00Z'] as const;
const list=(items:any[])=>Response.json({items});
it('does not treat a failed calendar list request as empty availability', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('{}',{status:403}));
  await expect(fetchBusyRanges(...range)).rejects.toThrow('calendar_list_unavailable');
});
it('ignores all-day, free, declined and cancelled events on a UTC HoneyBook calendar', async () => {
  const honeybook='c_honeybook@group.calendar.google.com';
  vi.mocked(fetch).mockResolvedValueOnce(list([{id:honeybook,accessRole:'owner'}])).mockResolvedValueOnce(Response.json({items:[
    {status:'confirmed',start:{date:'2026-09-26T00:00:00Z'},end:{date:'2026-09-27T00:00:00Z'}},
    {status:'confirmed',transparency:'transparent',start:{dateTime:'2026-09-25T20:30:00Z'},end:{dateTime:'2026-09-25T21:30:00Z'}},
    {status:'cancelled',start:{dateTime:'2026-09-25T15:00:00Z'},end:{dateTime:'2026-09-25T16:00:00Z'}},
    {status:'confirmed',start:{dateTime:'2026-09-25T12:00:00-04:00'},end:{dateTime:'2026-09-25T13:00:00-04:00'},attendees:[{self:true,responseStatus:'declined'}]},
    {status:'confirmed',start:{dateTime:'2026-09-25T20:30:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-09-25T21:30:00Z'}},
  ]}));
  expect(await fetchBusyRanges(...range)).toEqual([{start:'2026-09-25T20:30:00.000Z',end:'2026-09-25T21:30:00.000Z'}]);
});
it('does not count teammates’ shared calendars, the master bookings calendar or holidays as personal busy time', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(list([{id:'person@example.com',accessRole:'owner'},{id:'karen@example.com',accessRole:'freeBusyReader'},{id:'info@oceanoblue.net',accessRole:'writer'},{id:'en.usa#holiday@group.v.calendar.google.com',accessRole:'reader'}]))
    .mockResolvedValueOnce(Response.json({items:[{start:{dateTime:'2026-09-25T10:30:00-04:00'},end:{dateTime:'2026-09-25T11:00:00-04:00'}}]}));
  expect(await fetchBusyRanges(...range)).toEqual([{start:'2026-09-25T14:30:00.000Z',end:'2026-09-25T15:00:00.000Z'}]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('/calendars/person%40example.com/events');
});
it('rejects per-calendar free/busy errors even on HTTP 200', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(list([{id:'family@example.com',accessRole:'freeBusyReader'}]))
    .mockResolvedValueOnce(Response.json({calendars:{'family@example.com':{errors:[{reason:'notFound'}]}}}));
  await expect(fetchBusyRanges(...range)).rejects.toThrow('calendar_freebusy_incomplete');
});
it('does not treat an unreadable owned calendar as empty', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(list([{id:'person@example.com',accessRole:'owner'}])).mockResolvedValueOnce(new Response('{}',{status:500}));
  await expect(fetchBusyRanges(...range)).rejects.toThrow('calendar_events_500');
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
it('keeps never-connected photographers without a shared calendar on internal availability', async () => {
  row=null;
  expect(await fetchMemberBusy(...range)).toEqual({source:'none',busy:[]});
  expect(fetch).not.toHaveBeenCalled();
});
describe('a photographer who shared their calendar instead of connecting', () => {
  const karen=['karen','2026-09-25T04:00:00Z','2026-09-26T04:00:00Z'] as const;
  beforeEach(()=>{
    tables.team_calendar_connections=[{team_member_id:'person',provider:'google',is_active:true,scope:'https://www.googleapis.com/auth/calendar.readonly'}];
  });
  it('reads free/busy through the Ops account the calendar was shared with', async () => {
    const busy=[{start:'2026-09-25T15:00:00Z',end:'2026-09-25T17:00:00Z'}];
    vi.mocked(fetch).mockResolvedValueOnce(list([{id:'person@example.com',accessRole:'owner'},{id:'Karen@example.com',accessRole:'freeBusyReader'}]))
      .mockResolvedValueOnce(Response.json({calendars:{'Karen@example.com':{busy}}}));
    expect(await fetchMemberBusy(...karen)).toEqual({source:'shared',busy});
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).items).toEqual([{id:'Karen@example.com'}]);
  });
  it('stays on internal availability when nobody can see the calendar', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(list([{id:'person@example.com',accessRole:'owner'}]));
    expect(await fetchMemberBusy(...karen)).toEqual({source:'none',busy:[]});
  });
  it('does not treat an unreadable share as empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}',{status:503}));
    await expect(fetchMemberBusy(...karen)).rejects.toThrow('calendar_shared_unavailable');
  });
});

const hold={summary:'Video · Test property',startIso:'2026-09-30T19:30:00Z',endIso:'2026-09-30T21:30:00Z',timezone:'America/New_York',transparency:'opaque' as const,attendees:[]};
it('recreates a deleted calendar hold with a deterministic replacement ID and reuses it on retry',async()=>{
  const ids:string[]=[];
  let replacement:string|undefined;
  vi.mocked(fetch).mockImplementation(async(_url,init)=>{
    const method=init?.method||'GET';
    if(method==='POST'){
      const id=JSON.parse(String(init?.body)).id;ids.push(id);
      if(ids.length===1||ids.length===3)return new Response('{}',{status:409});
      if(!replacement){replacement=id;return Response.json({id});}
      return new Response('{}',{status:409});
    }
    if(method==='PATCH')return Response.json({id:replacement});
    return Response.json({id:'old',status:ids.length===4?'confirmed':'cancelled'});
  });
  expect(await insertEvent('person','calendar',hold,'none','order:calendar')).toEqual({id:expect.any(String),htmlLink:undefined});
  expect(await insertEvent('person','calendar',hold,'none','order:calendar')).toEqual({id:replacement,htmlLink:undefined});
  expect(ids[0]).not.toBe(ids[1]);expect(ids[0]).toBe(ids[2]);expect(ids[1]).toBe(ids[3]);
});
it('does not invent replacement events when a conflicting event cannot be verified',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}',{status:409})).mockResolvedValueOnce(new Response('{}',{status:503}));
  await expect(insertEvent('person','calendar',hold,'none','order:calendar')).rejects.toThrow('calendar_read_503');
  expect(fetch).toHaveBeenCalledTimes(2);
});
