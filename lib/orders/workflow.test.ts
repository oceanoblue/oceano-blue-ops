import { expect,it } from 'vitest';
import { nextOrderAction,orderListHref,type WorkflowFacts } from './workflow';
const booked:WorkflowFacts={status:'booked',archived:false,scheduled:true,assigned:true,originals:0,finals:0,media:0,services:1};
it('guides an incomplete booking to its missing details',()=>{
  expect(nextOrderAction({...booked,services:0}).area).toBe('overview');
  expect(nextOrderAction({...booked,scheduled:false}).area).toBe('overview');
  expect(nextOrderAction({...booked,assigned:false}).area).toBe('overview');
});
it('moves work from collection to review to delivery based on actual media and status',()=>{
  expect(nextOrderAction(booked).area).toBe('upload');
  expect(nextOrderAction({...booked,originals:10}).area).toBe('upload');
  expect(nextOrderAction({...booked,finals:10}).area).toBe('review');
  expect(nextOrderAction({...booked,media:1}).area).toBe('review');
  expect(nextOrderAction({...booked,status:'ready',finals:10}).area).toBe('delivery');
  expect(nextOrderAction({...booked,status:'delivered'}).area).toBe('delivery');
});
it('does not prompt more production on archived or cancelled orders',()=>{
  expect(nextOrderAction({...booked,archived:true,finals:20}).area).toBe('overview');
  expect(nextOrderAction({...booked,status:'cancelled',finals:20}).area).toBe('overview');
});
it('preserves search and sort across work queues while resetting old pagination and status',()=>{
  const href=orderListHref({q:'143 Oakesdale',page:'8',sort:'total',dir:'asc',status:'booked'},{view:'production',status:undefined});
  const params=new URL(href,'https://example.test').searchParams;
  expect(params.get('q')).toBe('143 Oakesdale');expect(params.get('sort')).toBe('total');
  expect(params.get('view')).toBe('production');expect(params.has('page')).toBe(false);expect(params.has('status')).toBe(false);
});
it('retains filters when changing pages and removes cleared values',()=>{
  const href=orderListHref({archived:'1',kind:'reel',q:'Smith'},{page:'2',q:undefined});
  const params=new URL(href,'https://example.test').searchParams;
  expect(params.get('page')).toBe('2');expect(params.get('archived')).toBe('1');expect(params.get('kind')).toBe('reel');expect(params.has('q')).toBe(false);
});
