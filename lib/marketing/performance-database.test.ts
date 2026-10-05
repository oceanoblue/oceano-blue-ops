import { afterAll,beforeAll,expect,it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let db:PGlite;
const order='00000000-0000-4000-8000-000000000001';
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table orders(id uuid primary key);insert into orders values('${order}');create function is_team_member() returns boolean language sql as $$select current_setting('test.staff',true)='yes'$$;create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;`);
 await db.exec(readFileSync('supabase/migrations/20260920232447_property_marketing_sites.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261005182949_property_performance.sql','utf8'));
 await db.exec(`insert into property_sites(order_id,headline) values('${order}','Property');insert into property_events(id,order_id,session_id,event,source) values(gen_random_uuid(),'${order}','${order}','page_view','instagram'),(gen_random_uuid(),'${order}','${order}','phone_click','instagram');insert into property_inquiries(id,order_id,name,email,message,source) values(gen_random_uuid(),'${order}','Buyer','buyer@example.test','Hello','instagram');`);
},30000);
afterAll(async()=>{await db.close();});
it('keeps reports, buyer contact details and access credentials private',async()=>{
 await db.exec('set role anon');for(const table of ['property_events','property_inquiries','property_report_access'])await expect(db.query(`select * from ${table}`)).rejects.toThrow('permission denied');
 await db.exec("reset role;set role authenticated;set test.staff='no'");expect((await db.query('select * from property_inquiries')).rows).toHaveLength(0);
 await expect(db.query(`select property_performance('${order}',now()-interval '1 day',now()+interval '1 day')`)).rejects.toThrow('permission denied');
 await db.exec("set test.staff='yes'");expect((await db.query('select * from property_inquiries')).rows).toHaveLength(1);
 await expect(db.query(`insert into property_events(id,order_id,session_id,event,source) values(gen_random_uuid(),'${order}','${order}','page_view','direct')`)).rejects.toThrow('permission denied');
 await db.exec('reset role');
});
it('aggregates activity without counting clicks as inquiries',async()=>{
 const {rows}=await db.query<{report:any}>(`select property_performance('${order}',now()-interval '1 day',now()+interval '1 day') report`);
 expect(rows[0].report.counts).toEqual({page_view:1,phone_click:1});expect(rows[0].report.inquiries).toBe(1);expect(rows[0].report.sessions).toBe(1);expect(rows[0].report.sources).toEqual([{source:'instagram',views:1}]);
});
