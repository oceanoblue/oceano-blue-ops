export interface RoutingProfile {
  team_member_id: string;
  enabled: boolean;
  capture_skills?: string[];
  priority: number;
  product_ids: string[] | null;
  service_zips: string[];
  travel_minutes: number;
  cross_zip_minutes: number;
  color: string;
}
export function routingEligible(profile: RoutingProfile | undefined, products: string[], zip?: string) {
  if (!profile?.enabled) return false;
  if (profile.product_ids !== null && (!products.length || products.some(id => !profile.product_ids!.includes(id)))) return false;
  return !profile.service_zips.length || (!!zip && profile.service_zips.includes(zip.slice(0,5)));
}
export function travelBuffer(profile: RoutingProfile | undefined, base: number, fromZip?: string | null, toZip?: string | null) {
  return Math.max(base, profile?.travel_minutes ?? base,
    fromZip?.slice(0,5) !== toZip?.slice(0,5) ? profile?.cross_zip_minutes ?? base : 0);
}
export const ASSIGNMENT_LABEL: Record<string,string> = {
  confirmed:'Confirmed',awaiting_response:'Awaiting photographer',rerouting:'Finding a backup',needs_attention:'Needs assignment',
};
export function assignmentLabel(order: {assignment_state?:string;assignment_confirmation_mode?:string;contractor_id?:string|null;contractor_response?:string|null;photographer_id?:string|null}) {
  if(order.contractor_response==='declined')return 'Declined · needs attention';
  if(order.assignment_state==='needs_attention'&&(order.photographer_id||order.contractor_id)&&!order.contractor_response)return 'Response overdue · still assigned';
  if(order.assignment_state && order.assignment_state!=='confirmed')return ASSIGNMENT_LABEL[order.assignment_state]||order.assignment_state;
  if(!order.photographer_id&&!order.contractor_id)return 'Unassigned';
  if(order.assignment_confirmation_mode==='automatic'&&order.assignment_state==='confirmed')return 'Confirmed automatically';
  if(order.contractor_id&&!order.contractor_response)return 'Awaiting photographer';
  return 'Confirmed';
}
