import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {afterAll,beforeAll,expect,it} from "vitest";
const account="a8134132-276f-4fa8-85f1-705828271d5f";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table social_programs(id uuid primary key);
    create table team_members(id uuid primary key);
    create table social_accounts(id uuid primary key,platforms text[],profile_links jsonb,is_active boolean);`);
  for(const file of ["20261121100335_social_channel_connections_and_results.sql","20261121113500_social_meta_identity_guard.sql"])
    await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
},60000);
afterAll(async()=>await db?.close());
it("refreshes the same provider ID; changing the URL or handle cannot silently replace the canonical ID",async()=>{
  await db.query("insert into social_accounts values($1,array['facebook'],'{\"facebook\":\"https://facebook.com/Example\"}',true)",[account]);
  const write=async(remote:string,url:string)=>db.query(`insert into social_channel_connections(account_id,platform,remote_id,label,encrypted_page_token,verified_profile_url)
    values($1,'facebook',$2,'Example','gcm1:synthetic',$3)
    on conflict(account_id,platform) do update set remote_id=excluded.remote_id,verified_profile_url=excluded.verified_profile_url`,[account,remote,url]);
  const original="https://facebook.com/Example",replacement="https://facebook.com/Other";
  await write("411",original);await write("411",original);
  await expect(write("412",original)).rejects.toThrow("Remove the existing");
  await db.query("update social_accounts set profile_links=jsonb_build_object('facebook',$2::text) where id=$1",[account,replacement]);
  await expect(write("411",original)).rejects.toThrow("Profile settings changed");
  await expect(write("412",replacement)).rejects.toThrow("Remove the existing");
  expect((await db.query("select remote_id,verified_profile_url from social_channel_connections")).rows).toEqual([{remote_id:"411",verified_profile_url:original}]);
});
