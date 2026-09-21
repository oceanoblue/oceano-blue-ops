import {describe,it,expect} from 'vitest';
import {routingEligible,travelBuffer,assignmentLabel,type RoutingProfile} from './routing';
const p:RoutingProfile={team_member_id:'p',enabled:true,priority:10,product_ids:['photo'],service_zips:['29910'],travel_minutes:30,cross_zip_minutes:60,color:'#0369a1'};
describe('photographer routing',()=>{
  it('requires every booked service and the property ZIP to be covered',()=>{
    expect(routingEligible(p,['photo'],'29910-1234')).toBe(true);
    expect(routingEligible(p,['photo','drone'],'29910')).toBe(false);
    expect(routingEligible(p,['photo'],'29928')).toBe(false);
    expect(routingEligible(p,[],'29910')).toBe(false);
    expect(routingEligible({...p,product_ids:null,service_zips:[]},['video'],'29928')).toBe(true);
    expect(routingEligible({...p,enabled:false},['photo'],'29910')).toBe(false);
  });
  it('uses the greatest applicable gap and extra allowance between ZIP codes',()=>{
    expect(travelBuffer(p,45,'29910','29910')).toBe(45);
    expect(travelBuffer(p,30,'29910','29928')).toBe(60);
    expect(travelBuffer(p,90,'29910','29928')).toBe(90);
  });
  it('never labels an unanswered or declined contractor booking as confirmed',()=>{
    expect(assignmentLabel({contractor_id:'c',assignment_state:'confirmed'})).toBe('Awaiting photographer');
    expect(assignmentLabel({contractor_response:'declined'})).toContain('Declined');
    expect(assignmentLabel({photographer_id:'p'})).toBe('Confirmed');
  });
});
