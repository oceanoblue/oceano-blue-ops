import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
it('claims only once, rejects stale completions, gates readiness, and preserves published videos',async()=>{
 const db=new PGlite();
 const ep='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role;
   create function is_team_member() returns boolean language sql as 'select false';
   create table podcast_shows(id uuid primary key,slug text,metadata jsonb);
   create table jobs(id uuid primary key,next_action text);
   create table podcast_episodes(id uuid primary key,show_id uuid,job_id uuid,status text,title text,metadata jsonb);
   create table external_links(job_id uuid,link_type text,external_id text);
   create table podcast_youtube_uploads(episode_id uuid,status text);
   create table production_events(job_id uuid,actor_type text,event_type text,summary text);
   insert into podcast_shows values('11111111-1111-4111-8111-111111111111','mind-your-health','{}');
   insert into jobs values('22222222-2222-4222-8222-222222222222',null);
   insert into podcast_episodes values('${ep}','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','needs_review','Episode','{}');
   insert into external_links values('22222222-2222-4222-8222-222222222222','youtube_video','abcdefghijk');
  `);
  await db.exec(readFileSync('supabase/migrations/20261110194000_podcast_thumbnails.sql','utf8'));
  await db.exec('set role authenticated');
  await expect(db.query("select claim_podcast_thumbnail('mind-your-health')")).rejects.toThrow('permission denied');
  await db.exec('reset role');
  await db.exec("update podcast_episodes set status='ready_to_publish'");
  expect((await db.query('select status from podcast_episodes')).rows).toEqual([{status:'needs_review'}]);
  const claim=async()=> (await db.query<{task:any}>("select claim_podcast_thumbnail('mind-your-health') as task")).rows[0].task;
  const t=await claim();expect(t.id).toBe(ep);expect(await claim()).toEqual({});
  await expect(db.query(`select complete_podcast_thumbnail('${ep}','44444444-4444-4444-8444-444444444444','path')`)).rejects.toThrow('lease expired');
  await db.query(`select complete_podcast_thumbnail('${ep}','${t.lease_token}','path')`);
  expect((await db.query('select status from podcast_episodes')).rows).toEqual([{status:'ready_to_publish'}]);
  expect(await claim()).toEqual({});
  await db.exec("update podcast_episodes set status='published'; update podcast_thumbnails set status='queued';");
  const second=await claim();
  await db.query(`select complete_podcast_thumbnail('${ep}','${second.lease_token}','second-path')`);
  expect((await db.query('select status from podcast_episodes')).rows).toEqual([{status:'published'}]);
  await db.exec("update podcast_thumbnails set status='generating',attempts=3,lease_expires_at=now()-interval '1 minute'");
  expect(await claim()).toEqual({});
  expect((await db.query('select status from podcast_thumbnails')).rows).toEqual([{status:'failed'}]);
 }finally{await db.close();}
},30000);
