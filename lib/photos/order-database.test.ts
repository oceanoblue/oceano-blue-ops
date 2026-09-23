import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
let db: PGlite;
const order = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const c = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const save = (ids = [b,a], expected: Record<string, number | null> = {[a]:null,[b]:null}) => db.query('select set_gallery_photo_order($1,$2,$3)', [order,ids,JSON.stringify(expected)]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create function is_team_member() returns boolean language sql as $$ select current_setting('test.team',true) = 'yes' $$;
    create table orders(id uuid primary key);
    create table photos(id uuid primary key, order_id uuid references orders, sort_order integer);
    insert into orders values ('${order}'),('${other}');`);
  await db.exec(readFileSync('supabase/migrations/20260923212727_gallery_photo_order.sql','utf8'));
});
afterAll(async () => {await db.close();});
beforeEach(async () => {await db.exec(`set test.team = 'yes'; delete from photos; insert into photos values ('${a}','${order}',null),('${b}','${order}',null),('${c}','${other}',8);`);});
it('saves all positions atomically and leaves other orders alone', async () => {
  await save();
  expect((await db.query('select id,sort_order from photos order by id')).rows).toEqual([{id:a,sort_order:2},{id:b,sort_order:1},{id:c,sort_order:8}]);
});
it('rejects a stale snapshot without any partial reorder', async () => {
  await save();
  await expect(save([a,b])).rejects.toThrow('gallery_changed');
  expect((await db.query('select id from photos where order_id=$1 order by sort_order',[order])).rows).toEqual([{id:b},{id:a}]);
});
it('rejects cross-order IDs, duplicate IDs and incomplete selections', async () => {
  await expect(save([a,c])).rejects.toThrow('invalid_photo_ids');
  await expect(save([a,a])).rejects.toThrow('invalid_photo_ids');
  await expect(save([a])).rejects.toThrow('invalid_photo_ids');
});
it('rejects non-staff even through direct RPC invocation', async () => {
  await db.exec("set test.team = 'no'");
  await expect(save()).rejects.toThrow('forbidden');
});
it('detects a photo arriving after the sort was prepared', async () => {
  await db.exec(`insert into photos values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${order}',null)`);
  await expect(save()).rejects.toThrow('gallery_changed');
});
