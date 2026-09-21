import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const order = '11111111-1111-4111-8111-111111111111';
const listing = '22222222-2222-4222-8222-222222222222';
const product = '33333333-3333-4333-8333-333333333333';
const at = '2026-09-21T12:00:00Z';
const photo = { product_id: product, description: 'Interior/Exterior Photography', quantity: 1, unit_price_cents: 22500 };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${order}'::uuid$$;
    create function is_team_member() returns boolean language sql as $$select true$$;
    create table listings(id uuid primary key, sqft int);
    create table orders(id uuid primary key,listing_id uuid,subtotal_cents int,total_cents int,updated_at timestamptz,download_paid_at timestamptz,download_paid_cents int,download_stripe_session_id text);
    create table products(id uuid primary key,name text,duration_minutes int,is_active boolean);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,description text,quantity int,unit_price_cents int,total_cents int,duration_minutes int);
    create table order_services(id uuid default gen_random_uuid(),order_id uuid,description text);
    create table activity_log(order_id uuid,listing_id uuid,actor_id uuid,actor_type text,action text,details jsonb);
  `);
  await db.exec(readFileSync('supabase/migrations/20260921144144_editable_order_services.sql','utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate order_payment_reviews,order_items,order_services,orders,listings,products,activity_log cascade;
    create or replace function is_team_member() returns boolean language sql as $$select true$$;
    insert into listings values('${listing}',null);
    insert into orders(id,listing_id,subtotal_cents,total_cents,updated_at) values('${order}','${listing}',20000,20000,'${at}');
    insert into products values('${product}','Interior/Exterior Photography',60,true);
    insert into order_items(order_id,product_id,description,quantity,unit_price_cents,total_cents,duration_minutes) values('${order}','${product}','Interior/Exterior Photography',1,20000,20000,60);`);
});
function edit(items: unknown[] = [photo], size: number | null = null, adjustment = 0, expected = at, expectedSize: number | null = null) {
  return db.query('select edit_order_services($1,$2,$3::jsonb,$4,$5,$6)',[order,expected,JSON.stringify(items),size,expectedSize,adjustment]);
}
function pay(revision = 0, amount = 20000, session = 'cs_test') {
  return db.query<{result:string}>('select settle_order_checkout($1,$2,$3,$4) result',[order,session,amount,revision]);
}
it('changes $200 to $225, saves square footage and an audit trail atomically', async () => {
  await edit([photo],1200);
  expect((await db.query('select subtotal_cents,total_cents,services_revision from orders')).rows).toEqual([{subtotal_cents:22500,total_cents:22500,services_revision:1}]);
  expect((await db.query('select sqft from listings')).rows).toEqual([{sqft:1200}]);
  const log = (await db.query<{details:any}>('select details from activity_log')).rows[0].details;
  expect(log.before_total_cents).toBe(20000); expect(log.after_total_cents).toBe(22500);
});
it('adds catalog and custom services with quantities and preserves an explicit discount', async () => {
  await edit([photo,{product_id:null,description:'Extra edits',quantity:2,unit_price_cents:2500}],null,-1000);
  expect((await db.query('select total_cents from orders')).rows).toEqual([{total_cents:26500}]);
  expect((await db.query('select count(*)::int n from order_items')).rows).toEqual([{n:2}]);
});
it('removes services without resurrecting legacy lines', async () => {
  await db.exec(`insert into order_services(order_id,description) values('${order}','Legacy');`);
  await edit([]);
  expect((await db.query('select total_cents from orders')).rows).toEqual([{total_cents:0}]);
  expect((await db.query('select count(*)::int n from order_services')).rows).toEqual([{n:0}]);
});
it('rolls back every change when a later line is invalid', async () => {
  await expect(edit([photo,{...photo,quantity:-1}],1200)).rejects.toThrow('invalid_item');
  expect((await db.query('select total_cents,services_revision from orders')).rows).toEqual([{total_cents:20000,services_revision:0}]);
  expect((await db.query('select sqft from listings')).rows).toEqual([{sqft:null}]);
});
it('rejects stale order and property versions', async () => {
  await expect(edit([photo],1200,0,'2026-09-20T12:00:00Z')).rejects.toThrow('order_changed');
  await db.exec('update listings set sqft=1400');
  await expect(edit([photo],1200)).rejects.toThrow('property_changed');
});
it('requires staff authorization and denies public function privileges', async () => {
  await db.exec('create or replace function is_team_member() returns boolean language sql as $$select false$$;');
  await expect(edit()).rejects.toThrow('forbidden');
  expect((await db.query(`select has_function_privilege('anon','edit_order_services(uuid,timestamptz,jsonb,integer,integer,integer)','execute') a,
    has_function_privilege('authenticated','settle_order_checkout(uuid,text,integer,integer)','execute') b,
    has_table_privilege('anon','order_payment_reviews','select') c`)).rows).toEqual([{a:false,b:false,c:false}]);
});
it('rejects new inactive products while retaining existing retired services', async () => {
  await db.exec('update products set is_active=false');
  await edit();
  await db.exec("delete from order_items; update orders set updated_at='2026-09-21T12:00:00Z'");
  await expect(edit()).rejects.toThrow('invalid_product');
});
it('rejects invalid totals, fractional quantities and too many rows', async () => {
  await expect(edit([photo],null,-30000)).rejects.toThrow('invalid_total');
  await expect(edit([{...photo,quantity:1.5}])).rejects.toThrow('invalid_item');
  await expect(edit(Array(31).fill(photo))).rejects.toThrow('too_many_items');
});
it('settles the current invoice only once and prevents changes to paid invoices', async () => {
  expect((await pay()).rows[0].result).toBe('paid');
  expect((await pay()).rows[0].result).toBe('already_paid');
  await expect(edit()).rejects.toThrow('order_paid');
});
it('retains stale checkout payments for review without unlocking or charging again', async () => {
  await edit();
  expect((await pay()).rows[0].result).toBe('needs_review');
  expect((await pay()).rows[0].result).toBe('needs_review');
  expect((await db.query('select download_paid_at from orders')).rows).toEqual([{download_paid_at:null}]);
  expect((await db.query('select amount_cents,checkout_revision,current_revision from order_payment_reviews')).rows).toEqual([{amount_cents:20000,checkout_revision:0,current_revision:1}]);
  const current = (await db.query<{at:string}>('select updated_at::text at from orders')).rows[0].at;
  await expect(edit([photo],null,0,current)).rejects.toThrow('payment_needs_review');
});
it('accepts discounted or fully discounted current checkouts and flags a second payment', async () => {
  await edit();
  expect((await pay(1,0)).rows[0].result).toBe('paid');
  expect((await pay(1,22500,'cs_duplicate')).rows[0].result).toBe('needs_review');
  expect((await db.query('select download_paid_cents from orders')).rows).toEqual([{download_paid_cents:0}]);
});
