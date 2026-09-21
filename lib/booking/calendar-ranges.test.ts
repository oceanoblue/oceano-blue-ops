import {expect,it} from 'vitest';
import {scheduleCalendarRanges} from './calendar-ranges';
const range=(h:number,e:number)=>({start:`2026-09-22T${h}:00:00.000Z`,end:`2026-09-22T${e}:00:00.000Z`});
it('shows overlapping imports and live Google intervals once',()=>{expect(scheduleCalendarRanges([range(10,12),range(11,13)],[range(10,12)],[])).toEqual([range(10,13)]);});
it('hides calendar mirrors already represented by a shoot or manual time off',()=>{expect(scheduleCalendarRanges([range(10,11)],[range(12,13)],[range(10,11),range(12,13)])).toEqual([]);});
it('keeps cached calendar blocks when a calendar is not connected',()=>{expect(scheduleCalendarRanges([],[range(10,11)],[])).toEqual([range(10,11)]);});
