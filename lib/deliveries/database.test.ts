import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
let db:PGlite;
const actor='11111111-1111-4111-8111-111111111111', order='22222222-2222-4222-8222-222222222222',listing='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
const recipients=[{channel:'email',to:'me@example.test',status:'pending'}];
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create function is_team_member() returns boolean language sql as $$select current_setting('test.staff',true)='yes'$$;
 create table team_members(id uuid primary key);
 create table listings(id uuid primary key,status text);
 create table orders(id uuid primary key,listing_id uuid,status text,delivered_at timestamptz);
 create table delivery_links(id uuid primary key default gen_random_uuid(),order_id uuid,token text unique,created_by uuid,expires_at timestamptz,created_at timestamptz default now());`);
 await db.exec(readFileSync('supabase/migrations/20260917111545_client_gallery_delivery.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec(`reset role;truncate gallery_dispatches,delivery_links,orders,listings,team_members cascade;
 insert into team_members values('${actor}');insert into listings values('${listing}','review');insert into orders values('${order}','${listing}','review',null);`);});
async function prepare(test=false,key=id,hash='same',resend=false){return db.query<{d:any}>(`select prepare_gallery_dispatch($1,$2,$3,'token',$4,'',$5::jsonb,$6,$7) as d`,[key,order,actor,hash,JSON.stringify(recipients),test,resend]);}
async function finish(status:string,test=false){await prepare(test);await db.query(`update gallery_dispatches set status='sending',recipients=$1::jsonb where id=$2`,[JSON.stringify([{...recipients[0],status}]),id]);return db.query<{d:any}>('select to_jsonb(finish_gallery_dispatch($1)) as d',[id]);}
it('reuses one preview link without changing order or listing status',async()=>{
 await db.query('select prepare_gallery_link($1,$2,$3)',[order,actor,'first']);await db.query('select prepare_gallery_link($1,$2,$3)',[order,actor,'second']);
 expect((await db.query('select count(*)::int n from delivery_links')).rows).toEqual([{n:1}]);expect((await db.query('select status,delivered_at from orders')).rows).toEqual([{status:'review',delivered_at:null}]);
});
it('deduplicates the request and rejects changes to its payload',async()=>{
 await prepare();await prepare();expect((await db.query('select count(*)::int n from gallery_dispatches')).rows).toEqual([{n:1}]);
 await expect(prepare(false,id,'different')).rejects.toThrow('request_changed');
});
it('blocks a second active request and requires explicit resending afterward',async()=>{
 await prepare();const other='55555555-5555-4555-8555-555555555555';
 await expect(prepare(false,other)).rejects.toThrow('delivery_in_progress');
 await db.exec("update gallery_dispatches set status='sent'");
 await expect(prepare(false,other)).rejects.toThrow('confirm_resend');
 await prepare(false,other,'same',true);
});
it('only one caller can claim the same send',async()=>{
 await prepare();
 const claim=()=>db.query("update gallery_dispatches set status='sending' where id=$1 and status='prepared' returning id",[id]);
 expect((await claim()).rows).toHaveLength(1);expect((await claim()).rows).toHaveLength(0);
});
it('only successful real deliveries advance the order and listing together',async()=>{
 expect((await finish('accepted')).rows[0].d.status).toBe('sent');
 expect((await db.query('select status from orders')).rows).toEqual([{status:'delivered'}]);
 expect((await db.query('select status from listings')).rows).toEqual([{status:'delivered'}]);
});
it('test sends create no live gallery link and never mark an order delivered',async()=>{
 await finish('accepted',true);expect((await db.query('select count(*)::int n from delivery_links')).rows).toEqual([{n:0}]);
 expect((await db.query('select status from orders')).rows).toEqual([{status:'review'}]);
});
it('ambiguous sends need review and leave delivery status unchanged',async()=>{
 expect((await finish('sending')).rows[0].d.status).toBe('needs_review');
 expect((await db.query('select delivered_at from orders')).rows).toEqual([{delivered_at:null}]);
});
it('anonymous clients and non-staff cannot read histories or call send functions',async()=>{
 await prepare();await db.exec('set role anon');await expect(db.query('select * from gallery_dispatches')).rejects.toThrow('permission denied');
 await expect(db.query('select prepare_gallery_link($1,$2,$3)',[order,actor,'blocked'])).rejects.toThrow('permission denied');
 await db.exec('reset role;set role authenticated');expect((await db.query('select * from gallery_dispatches')).rows).toHaveLength(0);
 await expect(db.query('select finish_gallery_dispatch($1)',[id])).rejects.toThrow('permission denied');
 await db.exec("set test.staff='yes'");expect((await db.query('select * from gallery_dispatches')).rows).toHaveLength(1);
 await expect(db.exec("update gallery_dispatches set status='sent'")).rejects.toThrow('permission denied');
 await db.exec("reset role;set test.staff='no'");
});
