import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),insert:vi.fn(),update:vi.fn(),remove:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:mocks.admin}));
vi.mock('./api',()=>({insertEvent:mocks.insert,updateEvent:mocks.update,deleteEvent:mocks.remove,getEvent:mocks.get}));
vi.mock('@/lib/observability/report',()=>({logEvent:vi.fn()}));
import {syncShootCalendar} from './sync-shoot';
let order:any, connections:any[];
beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T14:00:00Z'));
  order={id:'order',status:'scheduled',scheduled_at:'2026-09-30T18:00:00Z',duration_minutes:210,photographer_id:'karen',videographer_id:'gustavo',contractor_id:'contractor',contractor_response:'accepted',listings:{address_line1:'48 Rice Mill Road'},assignment_round:2};
  connections=[{team_member_id:'gustavo',account_email:'gustavo@example.test',provider:'google',is_active:true}];
  mocks.insert.mockResolvedValue({id:'event'});
  mocks.admin.mockReturnValue({from:(table:string)=>{
    const filters:((row:any)=>boolean)[]=[];
    const rows=()=>table==='orders'?[order]:table==='team_members'?[{id:'gustavo',full_name:'Gustavo',email:'gustavo@example.test',role:'admin',is_active:true},{id:'karen',full_name:'Karen',email:'karen@example.test',role:'photographer',is_active:true}]:table==='contractors'?[{id:'contractor',full_name:'Karen',email:'karen@example.test',team_member_id:'karen'}]:table==='team_calendar_connections'?connections:[];
    const result=(single=false)=>({data:single?rows().filter(r=>filters.every(f=>f(r)))[0]??null:rows().filter(r=>filters.every(f=>f(r))),error:null});
    const q:any={select:()=>q,limit:()=>q,upsert:()=>q,eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q;},maybeSingle:async()=>result(true),then:(r:any)=>Promise.resolve(result()).then(r)};return q;
  }});
});
afterEach(()=>vi.useRealTimers());
it('invites Karen for photography and places a silent video hold on Gustavo’s connected calendar',async()=>{
  await syncShootCalendar('order',{strict:true});
  expect(mocks.insert).toHaveBeenCalledTimes(2);
  expect(mocks.insert).toHaveBeenCalledWith('gustavo','info@oceanoblue.net',expect.objectContaining({summary:'Karen + Gustavo · 48 Rice Mill Road',attendees:[{email:'karen@example.test',responseStatus:'accepted'}],description:expect.stringContaining('Videographer: Gustavo')}),'all','order:info@oceanoblue.net');
  expect(mocks.insert).toHaveBeenCalledWith('gustavo','gustavo@example.test',expect.objectContaining({summary:'Video · 48 Rice Mill Road',transparency:'opaque',startIso:'2026-09-30T18:00:00.000Z',endIso:'2026-09-30T21:30:00.000Z',attendees:[]}),'none','order:gustavo@example.test');
  expect(mocks.insert.mock.calls[0][2].description).not.toContain('/respond?');
});
it('creates only one personal hold when the same person covers both roles',async()=>{
  order.photographer_id='gustavo';order.contractor_id=null;
  await syncShootCalendar('order',{strict:true});
  expect(mocks.insert).toHaveBeenCalledTimes(2);
  expect(mocks.insert.mock.calls.filter(c=>c[1]==='gustavo@example.test')).toHaveLength(1);
  expect(mocks.insert.mock.calls[0][2].attendees).toEqual([]);
});
it('does not apply the photographer response to the video invitation',async()=>{
  connections=[{team_member_id:'gustavo',account_email:'office@example.test',provider:'google',is_active:true}];
  order.videographer_id='karen';order.photographer_id='gustavo';order.contractor_id=null;
  await syncShootCalendar('order',{strict:true});
  expect(mocks.insert.mock.calls[0][2].attendees).toEqual([{email:'karen@example.test'}]);
  expect(mocks.insert.mock.calls[0][2].description).toContain('Videographer: Karen');
});
it('keeps the client window but invites photography and holds video for their own sequential hours',async()=>{
  Object.assign(order,{scheduled_at:'2026-09-30T19:30:00Z',duration_minutes:120,photographer_duration_minutes:60,videographer_start_offset_minutes:60,videographer_duration_minutes:60,contractor_response:null});
  await syncShootCalendar('order',{strict:true});
  expect(mocks.insert).toHaveBeenCalledTimes(3);
  expect(mocks.insert).toHaveBeenCalledWith('gustavo','info@oceanoblue.net',expect.objectContaining({startIso:'2026-09-30T19:30:00.000Z',endIso:'2026-09-30T21:30:00.000Z',attendees:[]}),'all','order:info@oceanoblue.net');
  expect(mocks.insert).toHaveBeenCalledWith('gustavo','info@oceanoblue.net',expect.objectContaining({summary:'Photography · Karen · 48 Rice Mill Road',startIso:'2026-09-30T19:30:00.000Z',endIso:'2026-09-30T20:30:00.000Z',attendees:[{email:'karen@example.test',responseStatus:undefined}]}),'all','order:info@oceanoblue.net:photographer');
  expect(mocks.insert).toHaveBeenCalledWith('gustavo','gustavo@example.test',expect.objectContaining({startIso:'2026-09-30T20:30:00.000Z',endIso:'2026-09-30T21:30:00.000Z',attendees:[]}),'none','order:gustavo@example.test');
});
