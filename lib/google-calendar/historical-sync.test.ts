import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),insert:vi.fn(),update:vi.fn(),remove:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:mocks.admin}));
vi.mock('./api',()=>({insertEvent:mocks.insert,updateEvent:mocks.update,deleteEvent:mocks.remove,getEvent:mocks.get}));
vi.mock('@/lib/observability/report',()=>({logEvent:vi.fn()}));
import {syncShootCalendar} from './sync-shoot';
let order:any, existing:any[], tables:string[];
beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T14:00:00Z'));
  order={id:'order',status:'scheduled',scheduled_at:'2026-09-23T14:00:00Z',duration_minutes:60,contractor_id:'karen',listings:{address_line1:'Test property'},assignment_round:0};
  existing=[];tables=[];
  mocks.remove.mockResolvedValue(undefined);mocks.insert.mockResolvedValue(null);
  mocks.admin.mockReturnValue({from:(table:string)=>{
    tables.push(table);
    const data=table==='orders'?order:table==='team_members'?[{id:'admin'}]:table==='team_calendar_connections'?{team_member_id:'admin'}:table==='contractors'?{email:'photographer@example.test',full_name:'Test Photographer'}:existing;
    const q:any={select:()=>q,eq:()=>q,in:()=>q,limit:()=>q,delete:()=>q,maybeSingle:async()=>({data,error:null}),then:(r:any)=>Promise.resolve({data,error:null}).then(r)};
    return q;
  }});
});
afterEach(()=>vi.useRealTimers());
it.each([
  ['delivered','2026-09-23T14:00:00Z'],
  ['delivered','2026-08-24T14:00:00Z'],
  ['scheduled','2026-08-24T14:00:00Z'],
  ['cancelled','2026-08-24T14:00:00Z'],
])('leaves %s historical/completed work untouched',async(status,scheduled_at)=>{
  order.status=status;order.scheduled_at=scheduled_at;
  await syncShootCalendar('order',{strict:true});
  expect(tables).toEqual(['orders']);
  for(const call of [mocks.insert,mocks.update,mocks.remove,mocks.get])expect(call).not.toHaveBeenCalled();
});
it('still invites the photographer for an upcoming shoot',async()=>{
  await syncShootCalendar('order');
  expect(mocks.insert).toHaveBeenCalledWith('admin','info@oceanoblue.net',expect.objectContaining({attendees:[{email:'photographer@example.test',responseStatus:undefined}]}),'all',undefined);
});
it('still cancels the calendar invitation when an upcoming shoot is cancelled',async()=>{
  order.status='cancelled';existing=[{id:'mapping',event_id:'event',calendar_id:'info@oceanoblue.net',role:'master'}];
  await syncShootCalendar('order');
  expect(mocks.remove).toHaveBeenCalledWith('admin','info@oceanoblue.net','event','all');
  expect(mocks.insert).not.toHaveBeenCalled();
});
