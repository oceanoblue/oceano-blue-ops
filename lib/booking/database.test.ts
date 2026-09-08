import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';

let db: PGlite;
const photographer = '11111111-1111-4111-8111-111111111111';
const product = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const hash = 'a'.repeat(64);
let payload: Record<string, unknown>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type project_type as enum ('mls_real_estate','luxury_real_estate','architectural','interior_design');
    create function is_team_member() returns boolean language sql as $$select false$$;
    create table clients(id uuid primary key default gen_random_uuid(), email text unique, full_name text, phone text, brokerage text);
    create table listings(id uuid primary key default gen_random_uuid(),client_id uuid,address_line1 text,address_line2 text,city text,state text,zip text,lat double precision,lng double precision,sqft int,bedrooms int,bathrooms numeric,access_method text,highlights text,status text);
    create type service_type as enum ('photography');
    create table order_services(order_id uuid,service_type service_type,description text,quantity int);
    create table orders(order_number int, rush boolean, order_kind text, download_paid_at timestamptz, archived_at timestamptz, id uuid primary key default gen_random_uuid(),listing_id uuid,client_id uuid,status text,scheduled_at timestamptz,duration_minutes int,timezone text,client_notes text,photographer_id uuid,subtotal_cents int,total_cents int,project_type project_type default 'mls_real_estate',contractor_id uuid,pay_amount_cents int);
    create table products(id uuid primary key,name text,duration_minutes int,is_active boolean,audiences text[]);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,description text,quantity int,unit_price_cents int,total_cents int,duration_minutes int);
    create table activity_log(order_id uuid,listing_id uuid,actor_type text,action text,details jsonb);
    create table business_settings(id boolean primary key,buffer_minutes int,min_notice_hours int,max_notice_days int,default_timezone text);
    create table team_members(id uuid primary key,is_active boolean,role text,email text,phone text);
    create table team_availability(team_member_id uuid,is_active boolean,day_of_week int,start_local time,end_local time,timezone text);
    create table schedule_blocks(team_member_id uuid,is_available boolean,starts_at timestamptz,ends_at timestamptz);
    create table contractors(id uuid primary key,team_member_id uuid,is_active boolean,pay_rate_cents int);
    create function price_for_sqft(uuid,int) returns int language sql as $$select 20000$$;
  `);
  const triggerSource = readFileSync('supabase/migrations/0078_double_book_override.sql','utf8');
  const trigger = triggerSource.match(/create or replace function check_order_no_double_book\(\)[\s\S]*?\$\$;/i)?.[0];
  if (!trigger) throw new Error('Missing production overlap guard');
  await db.exec(trigger + `create trigger no_overlap before insert or update on orders for each row execute function check_order_no_double_book();`);
  await db.exec(readFileSync('supabase/migrations/20260908140351_reliable_public_booking.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260908141709_idempotent_order_pricing.sql','utf8'));
  const search = readFileSync('supabase/migrations/20260908140411_operations_search_and_health.sql','utf8').split('-- Cache the per-request')[0];
  await db.exec(search + 'commit;');
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate booking_followups,booking_requests,orders,order_items,order_services,listings,clients,activity_log,products,business_settings,team_members,team_availability,schedule_blocks,contractors cascade;
    insert into business_settings values(true,30,4,30,'America/New_York');
    insert into team_members values('${photographer}',true,'admin','office@example.test','+12025550123');
    insert into products values('${product}','Photo',60,true,array['real_estate']);
    insert into team_availability select '${photographer}',true,d,'09:00','17:00','America/New_York' from generate_series(0,6) d;`);
  await db.exec('create or replace function is_team_member() returns boolean language sql as $$select true$$;');
  const { rows } = await db.query<{at: string}>(`select (((now() at time zone 'America/New_York')::date+2+time '10:00') at time zone 'America/New_York')::text as at`);
  payload = { client_email:'client@example.test',client_name:'Client',client_phone:'',client_brokerage:'',address_line1:'Test property',address_line2:'',city:'Bluffton',state:'SC',zip:'29910',sqft:2000,scheduled_at:rows[0].at,duration_minutes:60,timezone:'America/New_York',access_method:'',highlights:'',photographer_id:photographer,project_type:'mls_real_estate',items:[{product_id:product,quantity:1}] };
});

async function book(body = payload, key = requestId, bodyHash = hash) {
  return db.query<{id: string}>('select commit_public_booking($1::jsonb,$2::uuid,$3) as id',[JSON.stringify(body),key,bodyHash]);
}

describe('public booking transaction', () => {
  it('commits one booking and each independent follow-up, and returns the same booking on replay', async () => {
    const first = await book();
    expect((await book()).rows[0].id).toBe(first.rows[0].id);
    expect((await db.query('select count(*)::int as n from orders')).rows).toEqual([{n:1}]);
    expect((await db.query('select count(*)::int as n from booking_followups')).rows).toEqual([{n:4}]);
  });
  it('rejects reusing a key with different details', async () => {
    await book();
    await expect(book({...payload,client_name:'Changed'},requestId,'b'.repeat(64))).rejects.toThrow('idempotency_conflict');
  });
  it('preserves an existing client profile regardless of public booking contact input', async () => {
    await db.exec("insert into clients(email,full_name,phone,brokerage) values('client@example.test','Verified name','123','Original');");
    await book({...payload,client_name:'Unverified replacement',client_phone:'456'});
    expect((await db.query('select full_name,phone,brokerage from clients')).rows).toEqual([{full_name:'Verified name',phone:'123',brokerage:'Original'}]);
  });
  it('keeps the legacy draft route from overwriting client profiles', async () => {
    await db.exec("insert into clients(email,full_name,phone,brokerage) values('client@example.test','Verified','123','Original');");
    await db.query("select create_draft_order('client@example.test','Changed','456','Changed','Property','City','SC','29910',0,0,2000,now(),array['photography'],'')");
    expect((await db.query('select full_name,phone from clients')).rows).toEqual([{full_name:'Verified',phone:'123'}]);
  });
  it('rejects a booking outside working hours or beyond the booking horizon', async () => {
    await expect(book({...payload,scheduled_at:new Date(Date.parse(String(payload.scheduled_at))+9*3600000).toISOString()})).rejects.toThrow('slot_unavailable');
    await expect(book({...payload,scheduled_at:new Date(Date.parse(String(payload.scheduled_at))+40*86400000).toISOString()})).rejects.toThrow('slot_unavailable');
  });
  it('filters across status buckets, searches all rows, and paginates a stable order', async () => {
    await db.exec(`insert into orders(order_number,status,order_kind,total_cents) select n,case when n%2=0 then 'booked' else 'scheduled' end,'shoot',n*100 from generate_series(1,310) n;`);
    const found = await db.query<{result:{total:number,rows:any[]}}>("select search_operations_orders(array['booked','scheduled'],null,false,'','order',true,7,50) as result");
    expect(found.rows[0].result.total).toBe(310); expect(found.rows[0].result.rows).toHaveLength(10);
    expect(found.rows[0].result.rows[0].order_number).toBe(301);
    const search = await db.query<{result:{total:number}}>("select search_operations_orders(null,null,false,'310') as result");
    expect(search.rows[0].result.total).toBe(1);
    await db.exec('create or replace function is_team_member() returns boolean language sql as $$select false$$;');
    const denied = await db.query<{result:{total:number}}>('select search_operations_orders() as result');
    expect(denied.rows[0].result.total).toBe(0);
  });
  it('replays pricing without duplicate items and retains totals from other lines', async () => {
    const order = (await book()).rows[0].id;
    await db.query("insert into order_items(order_id,description,quantity,total_cents) values($1,'Custom service',1,5000)",[order]);
    const args = [order,JSON.stringify(payload.items),2000];
    await db.query('select add_order_items_priced($1,$2::jsonb,$3)',args);
    await db.query('select add_order_items_priced($1,$2::jsonb,$3)',args);
    expect((await db.query('select count(*)::int as n from order_items')).rows).toEqual([{n:2}]);
    expect((await db.query('select total_cents from orders')).rows).toEqual([{total_cents:25000}]);
    await expect(db.query('select add_order_items_priced($1,$2::jsonb,$3)',[order,JSON.stringify([{product_id:product,quantity:-1}]),2000])).rejects.toThrow('invalid_quantity');
    expect((await db.query('select total_cents from orders')).rows).toEqual([{total_cents:25000}]);
  });
  it('rejects a past booking', async () => { await expect(book({...payload,scheduled_at:'2020-01-01T14:00:00Z'})).rejects.toThrow('slot_unavailable'); });
  it('rejects long blocks that span the entire selected day', async () => {
    await db.query(`insert into schedule_blocks values($1,false,$2::timestamptz-interval '7 days',$2::timestamptz+interval '7 days')`,[photographer,payload.scheduled_at]);
    await expect(book()).rejects.toThrow('slot_unavailable');
  });
  it('rejects an existing photographer conflict atomically', async () => {
    await book();
    await expect(book(payload,'44444444-4444-4444-8444-444444444444')).rejects.toThrow('slot_unavailable');
    expect((await db.query('select count(*)::int as n from orders')).rows).toEqual([{n:1}]);
    expect((await db.query('select count(*)::int as n from listings')).rows).toEqual([{n:1}]);
  });
  it('rejects inactive services and invalid quantities', async () => {
    await db.exec('update products set is_active=false');
    await expect(book()).rejects.toThrow('invalid_product');
    await db.exec('update products set is_active=true');
    await expect(book({...payload,items:[{product_id:product,quantity:-1}]})).rejects.toThrow('invalid_quantity');
  });
  it('derives duration instead of trusting the client', async () => {
    await book({...payload,duration_minutes:15});
    expect((await db.query('select duration_minutes from orders')).rows).toEqual([{duration_minutes:60}]);
  });
  it('denies API roles direct execution and isolates follow-up data', async () => {
    expect((await db.query(`select has_function_privilege('anon','commit_public_booking(jsonb,uuid,text)','EXECUTE') as anon,
      has_function_privilege('authenticated','commit_public_booking(jsonb,uuid,text)','EXECUTE') as authenticated,
      has_function_privilege('service_role','commit_public_booking(jsonb,uuid,text)','EXECUTE') as service,
      has_table_privilege('anon','booking_followups','SELECT') as followups`)).rows).toEqual([{anon:false,authenticated:false,service:true,followups:false}]);
  });
  it('claims separate work and prevents two workers from claiming the same task', async () => {
    await book();
    const first = await db.query<{id:string}>('select id from claim_booking_followups(3)');
    const second = await db.query<{id:string}>('select id from claim_booking_followups(3)');
    expect(first.rows).toHaveLength(3);
    expect(second.rows).toHaveLength(1);
    expect(new Set([...first.rows,...second.rows].map(r=>r.id)).size).toBe(4);
  });
});
