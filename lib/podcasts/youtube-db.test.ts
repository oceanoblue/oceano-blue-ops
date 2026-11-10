import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('keeps credentials private, claims once, repairs approval atomically, and requires approval to confirm publishing',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table podcast_shows(id uuid primary key);
      create table jobs(id uuid primary key,next_action text);
      create table podcast_episodes(id uuid primary key,show_id uuid,job_id uuid,status text,title text,metadata jsonb);
      create table external_links(id uuid default gen_random_uuid(),job_id uuid,link_type text,url text,external_id text,label text);
      create table delivery_versions(job_id uuid,delivery_type text,status text,title text,external_url text);
      create table podcast_deliverables(episode_id uuid,deliverable_type text,status text,external_url text);
      create table approval_policies(id uuid default gen_random_uuid(),key text);
      create table approvals(id uuid default gen_random_uuid(),job_id uuid,policy_id uuid,status text,notes text,created_at timestamptz default now());
      insert into podcast_shows values('11111111-1111-4111-8111-111111111111');
      insert into jobs values('22222222-2222-4222-8222-222222222222',null);
      insert into podcast_episodes values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','needs_review','Episode','{}');
      insert into approval_policies(key) values('publish_content');
    `);
    await db.exec(readFileSync('supabase/migrations/20261110154806_podcast_youtube_uploads.sql','utf8'));
    await db.exec(`set role authenticated`);
    await expect(db.query('select * from podcast_youtube_connections')).rejects.toThrow('permission denied');
    await expect(db.query("select * from claim_podcast_youtube_upload('44444444-4444-4444-8444-444444444444')")).rejects.toThrow('permission denied');
    await db.exec('reset role');
    await db.exec("insert into podcast_youtube_uploads(episode_id) values('33333333-3333-4333-8333-333333333333')");
    expect((await db.query("select * from claim_podcast_youtube_upload('44444444-4444-4444-8444-444444444444')")).rows).toHaveLength(1);
    expect((await db.query("select * from claim_podcast_youtube_upload('55555555-5555-4555-8555-555555555555')")).rows).toHaveLength(0);
    const complete="select record_podcast_youtube_upload('33333333-3333-4333-8333-333333333333','abcdefghijk','unlisted')";
    await db.query(complete);await db.query(complete);
    expect((await db.query('select * from approvals')).rows).toHaveLength(1);
    expect((await db.query('select * from external_links')).rows).toHaveLength(1);
    expect((await db.query('select status from podcast_episodes')).rows).toEqual([{status:'ready_to_publish'}]);
    const publish="select confirm_podcast_youtube_publication('33333333-3333-4333-8333-333333333333','abcdefghijk')";
    await expect(db.query(publish)).rejects.toThrow('Human publish approval required');
    await db.exec("update approvals set status='approved'");
    await db.query(publish);
    expect((await db.query('select status from podcast_episodes')).rows).toEqual([{status:'published'}]);
    await db.query(complete);
    expect((await db.query('select status from podcast_episodes')).rows).toEqual([{status:'published'}]);
    expect((await db.query('select status from approvals')).rows).toEqual([{status:'approved'}]);
    await expect(db.query("select record_podcast_youtube_upload('33333333-3333-4333-8333-333333333333','12345678901','unlisted')")).rejects.toThrow('different video');
  }finally{await db.close();}
},30000);
