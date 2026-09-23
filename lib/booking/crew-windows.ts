export const CREW_WINDOW_COLUMNS='photographer_start_offset_minutes,photographer_duration_minutes,videographer_start_offset_minutes,videographer_duration_minutes';
export type CrewTiming={scheduled_at:string|null;duration_minutes?:number|null;photographer_start_offset_minutes?:number|null;photographer_duration_minutes?:number|null;videographer_start_offset_minutes?:number|null;videographer_duration_minutes?:number|null};
export function roleWindow(order:CrewTiming,role:'photographer'|'videographer') {
  const offset=order[`${role}_start_offset_minutes`]??0,duration=order[`${role}_duration_minutes`]??order.duration_minutes??60;
  const start=order.scheduled_at?Date.parse(order.scheduled_at)+offset*60000:null;
  return {start:start===null?null:new Date(start).toISOString(),end:start===null?null:new Date(start+duration*60000).toISOString(),duration,offset};
}
export function memberWindows(order:CrewTiming&{photographer_id?:string|null;videographer_id?:string|null;contractors?:{team_member_id?:string|null}|null},member:string) {
  return ([...((order.contractors?.team_member_id||order.photographer_id)===member?['photographer' as const]:[]),...(order.videographer_id===member?['videographer' as const]:[])]).map(role=>roleWindow(order,role));
}
