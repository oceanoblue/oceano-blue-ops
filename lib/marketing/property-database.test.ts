import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,expect,it } from 'vitest';
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table orders(id uuid primary key);insert into orders values('00000000-0000-4000-8000-000000000001');create function is_team_member() returns boolean language sql as $$select current_setting('test.staff',true)='yes'$$;create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;`);await db.exec(readFileSync('supabase/migrations/20260920232447_property_marketing_sites.sql','utf8'));await db.exec("insert into property_sites(order_id,headline) select id,'Test property' from orders");},30000);
afterAll(async()=>{await db?.close();});
it('keeps drafts and published configuration private and allows only staff to write',async()=>{
 await db.exec('set role anon');await expect(db.query('select * from property_sites')).rejects.toThrow('permission denied');await db.exec("reset role;set role authenticated;set test.staff='no'");expect((await db.query('select * from property_sites')).rows).toHaveLength(0);expect((await db.query("update property_sites set is_published=true returning *")).rows).toHaveLength(0);
 await db.exec("set test.staff='yes'");expect((await db.query('select * from property_sites')).rows).toHaveLength(1);await db.exec('update property_sites set is_published=true');await db.exec("set test.staff='no'");expect((await db.query('select * from property_sites')).rows).toHaveLength(0);
});
