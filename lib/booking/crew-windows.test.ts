import {expect,it,vi} from 'vitest';
vi.mock('@/lib/supabase/server',()=>({createAdminClient:vi.fn()}));
vi.mock('@/lib/google-calendar/api',()=>({fetchMemberBusy:vi.fn()}));
import {roleWindow,memberWindows} from './crew-windows';
import {workingHoursWarning} from './crew-review';
import {assignmentLabel} from './routing';
const order={scheduled_at:'2026-09-30T19:30:00Z',duration_minutes:120,photographer_id:'karen',videographer_id:'gustavo',photographer_duration_minutes:60,videographer_start_offset_minutes:60,videographer_duration_minutes:60};
it('defaults existing bookings to the full client appointment',()=>{
 expect(roleWindow({scheduled_at:order.scheduled_at,duration_minutes:120},'photographer')).toEqual({start:'2026-09-30T19:30:00.000Z',end:'2026-09-30T21:30:00.000Z',duration:120,offset:0});
});
it('assigns separate sequential windows to each crew member',()=>{
 expect(memberWindows(order,'karen')).toEqual([{start:'2026-09-30T19:30:00.000Z',end:'2026-09-30T20:30:00.000Z',duration:60,offset:0}]);
 expect(memberWindows(order,'gustavo')).toEqual([{start:'2026-09-30T20:30:00.000Z',end:'2026-09-30T21:30:00.000Z',duration:60,offset:60}]);
});
it('checks the assigned hour against working hours instead of the whole client appointment',()=>{
 const hours=[{is_active:true,day_of_week:3,start_local:'08:00:00',end_local:'17:00:00',timezone:'America/New_York'}];
 expect(workingHoursWarning('Karen',order.scheduled_at,60,hours)).toBe(null);
 expect(workingHoursWarning('Karen',order.scheduled_at,120,hours)).toContain('outside');
});
it('keeps overdue assigned shoots distinct from unassigned work',()=>{
 expect(assignmentLabel({assignment_state:'needs_attention',photographer_id:'karen',contractor_response:null} as any)).toBe('Response overdue · still assigned');
});
