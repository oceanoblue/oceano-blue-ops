import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {getAvailability} from './availability';
const {tables,busy}=vi.hoisted(()=>({tables:{} as Record<string,any>,busy:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:()=>({from:(table:string)=>{let ids:string[]|undefined;const q:any={then:(resolve:any)=>Promise.resolve({data:table==='products'&&ids?tables[table].filter((row:any)=>ids!.includes(row.id)):tables[table],error:null}).then(resolve)};for(const k of ['select','eq','gte','lte','lt','gt','not','maybeSingle'])q[k]=()=>q;q.in=(column:string,values:string[])=>{if(table==='products'&&column==='id')ids=values;return q;};return q;}})}));
vi.mock('@/lib/google-calendar/api',()=>({fetchBusyRanges:busy}));
vi.mock('@/lib/observability/report',()=>({captureError:vi.fn()}));
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-21T00:00:00Z'));busy.mockReset();busy.mockResolvedValue([]);
 tables.business_settings={buffer_minutes:30,min_notice_hours:4,max_notice_days:30,default_timezone:'America/New_York',scheduling_dispatch_enabled:true};
 tables.team_members=[{id:'gustavo'},{id:'karen'}];
 tables.photographer_routing=[{team_member_id:'gustavo',capture_skills:['photography','videography','drone','floor_plan','tour_360'],priority:100,enabled:true,product_ids:null,service_zips:[],travel_minutes:30,cross_zip_minutes:45},{team_member_id:'karen',capture_skills:['photography','tour_360'],priority:10,enabled:true,product_ids:['photo'],service_zips:[],travel_minutes:30,cross_zip_minutes:45}];
 tables.team_availability=['gustavo','karen'].map(team_member_id=>({team_member_id,timezone:'America/New_York',day_of_week:2,start_local:'09:00',end_local:'17:00'}));
 tables.products=[{id:'photo',name:'Photography',kind:'photo'},{id:'video',name:'Cinematic Videography',kind:'video'},{id:'drone',name:'Drone Photography',kind:'addon'},{id:'360',name:'360 tour',kind:'tour'}];
 tables.orders=[];tables.schedule_blocks=[];
});
afterEach(()=>vi.useRealTimers());
const options={productIds:['photo'],zip:'29910'};
it('prefers the qualified contractor when both are available regardless of row order',async()=>{
 const result=await getAvailability('2026-09-22',60,undefined,options);
 expect(result.slots.length).toBeGreaterThan(0);expect(new Set(result.slots.map(s=>s.photographer_id))).toEqual(new Set(['karen']));
});
it('offers contractor capacity when Gustavo is busy and Gustavo when the contractor is busy',async()=>{
 busy.mockImplementation(async(id:string)=>id==='gustavo'?[{start:'2026-09-22T00:00:00Z',end:'2026-09-23T23:00:00Z'}]:[]);
 expect((await getAvailability('2026-09-22',60,undefined,options)).slots[0].photographer_id).toBe('karen');
 busy.mockImplementation(async(id:string)=>id==='karen'?[{start:'2026-09-22T00:00:00Z',end:'2026-09-23T23:00:00Z'}]:[]);
 expect((await getAvailability('2026-09-22',60,undefined,options)).slots[0].photographer_id).toBe('gustavo');
});
it('never assigns specialty work to an unqualified contractor',async()=>{
 const result=await getAvailability('2026-09-22',60,undefined,{...options,productIds:['photo','drone']});
 expect(new Set(result.slots.map(s=>s.photographer_id))).toEqual(new Set(['gustavo']));
});
it('excludes failed connected calendars while retaining verified capacity',async()=>{
 busy.mockImplementation(async(id:string)=>{if(id==='karen')throw new Error('calendar unavailable');return [];});
 const result=await getAvailability('2026-09-22',60,undefined,options);
 expect(result.calendarDegraded).toBe(true);expect(result.slots[0].photographer_id).toBe('gustavo');
});
it('resolves contractor identity and applies extra cross-ZIP travel time',async()=>{
 tables.orders=[{photographer_id:null,contractors:{team_member_id:'karen'},listings:{zip:'29928'},scheduled_at:'2026-09-22T13:00:00Z',duration_minutes:60}];
 const result=await getAvailability('2026-09-22',60,undefined,{...options,allCandidates:true});
 expect(result.slots.some(s=>s.iso==='2026-09-22T14:30:00.000Z'&&s.photographer_id==='karen')).toBe(false);
 expect(result.slots.some(s=>s.iso==='2026-09-22T15:00:00.000Z'&&s.photographer_id==='karen')).toBe(true);
});
it('blocks video slots for a photo/360 person even if their product list is unrestricted',async()=>{
 tables.photographer_routing[1].product_ids=null;
 const result=await getAvailability('2026-09-22',60,undefined,{...options,productIds:['photo','video']});
 expect(new Set(result.slots.map(s=>s.photographer_id))).toEqual(new Set(['gustavo']));
});
it('treats the videographer as busy, including when the next job is photography',async()=>{
 tables.orders=[{photographer_id:'karen',videographer_id:'gustavo',scheduled_at:'2026-09-22T13:00:00Z',duration_minutes:60,listings:{zip:'29910'}}];
 const result=await getAvailability('2026-09-22',60,undefined,{...options,allCandidates:true});
 expect(result.slots.some(s=>s.iso==='2026-09-22T13:00:00.000Z')).toBe(false);
 expect(result.slots.some(s=>s.iso==='2026-09-22T14:30:00.000Z'&&s.photographer_id==='gustavo')).toBe(true);
});
it('allows qualified 360 bookings without giving the photographer video eligibility',async()=>{
 tables.photographer_routing[1].product_ids=null;
 expect((await getAvailability('2026-09-22',60,undefined,{...options,productIds:['360']})).slots[0].photographer_id).toBe('karen');
});
