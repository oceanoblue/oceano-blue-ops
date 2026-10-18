import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { officeClientOptions } from './office-options';
function directory(total:number, options:{cap?:number; failAt?:number; changeAt?:number; duplicateAt?:number; missingCount?:boolean; emptyAt?:number; throwAt?:number}={}) {
  const rows=Array.from({length:total},(_,i)=>({id:`client-${String(i).padStart(4,'0')}`,full_name:i<300?'Same client name':`Client ${i}`,email:`client${i}@example.test`,brokerage:'Company'}));
  const calls:{table:string;columns:string;count:unknown;eq:unknown[][];orders:unknown[][];range:number[]}[]=[];
  const from=vi.fn((table:string)=>({select:(columns:string,count:unknown)=>{
    const call={table,columns,count,eq:[] as unknown[][],orders:[] as unknown[][],range:[] as number[]};calls.push(call);
    const query={eq:(...args:unknown[])=>{call.eq.push(args);return query;},order:(...args:unknown[])=>{call.orders.push(args);return query;},range:async(start:number,end:number)=>{
      call.range=[start,end];if(start===options.throwAt)throw new Error('Network outage');
      const data=options.emptyAt===start?[]:rows.slice(start,start+Math.min(end-start+1,options.cap??Infinity));
      if(options.duplicateAt===start&&data.length)data[0]=rows[0];
      return {data,error:options.failAt===start?{message:'Database details should not leak'}:null,count:options.missingCount?null:total+(start===options.changeAt?1:0)};
    }};return query;
  }}));
  return {db:{from} as unknown as SupabaseClient<Database>,calls,rows};
}
describe('complete office client selectors',()=>{
 it('loads beyond one thousand with stable name/id ordering and preserves requested fields',async()=>{
  const d=directory(1120),result=await officeClientOptions(d.db,{columns:'id, full_name, email, brokerage'});
  expect(result.error).toBeNull();expect(result.data).toEqual(d.rows);expect(result.data.at(-1)?.id).toBe('client-1119');
  expect(d.calls.map(c=>c.range)).toEqual([[0,249],[250,499],[500,749],[750,999],[1000,1249]]);
  for(const c of d.calls){expect(c.table).toBe('clients');expect(c.columns).toBe('id, full_name, email, brokerage');expect(c.count).toEqual({count:'exact'});expect(c.orders).toEqual([['full_name',{ascending:true}],['id',{ascending:true}]]);expect(c.eq).toEqual([]);}
 });
 it('preserves active-only filtering on every page without changing unfiltered podcast/directory behavior',async()=>{
  const d=directory(501);expect((await officeClientOptions(d.db,{activeOnly:true})).data).toHaveLength(501);for(const c of d.calls)expect(c.eq).toEqual([['is_archived',false]]);
 });
 it('finishes correctly even if the REST cap returns fewer rows than each requested page',async()=>{
  const d=directory(1120,{cap:100});const result=await officeClientOptions(d.db);expect(result.error).toBeNull();expect(result.data).toHaveLength(1120);expect(d.calls.at(-1)?.range).toEqual([1100,1349]);
 });
 it('returns an explicit complete empty directory',async()=>{const d=directory(0);expect(await officeClientOptions(d.db)).toEqual({data:[],error:null});expect(d.calls).toHaveLength(1);});
 it.each([{failAt:250},{throwAt:250},{emptyAt:250},{changeAt:250},{duplicateAt:250},{missingCount:true}])('discards partial choices instead of silently hiding clients on failure: %j',async options=>{
  const d=directory(1120,options),result=await officeClientOptions(d.db);expect(result.data).toEqual([]);expect(result.error?.message).toContain('complete client list');expect(result.error?.message).not.toContain('Database details');
 });
});
