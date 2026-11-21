import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { contractMonthState, coveredSlots } from './planning';
import { planSlots, shiftMonth } from './schema';
import { readSocialPages } from './db-pages';

const actor = randomUUID();
const client = randomUUID();
const account = randomUUID();
let db: PGlite;
let month: string;
const query = async <T>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
const runPlan = async (target: string) => (await query<{n:number}>('select social_plan_month($1,$2,$3) n', [client,target+'-01',actor]))[0].n;
const scope = (target: string) => query<{account_id:string,posts_per_month:number,reels_per_month:number,from_legacy_plan:boolean}>('select * from social_month_scope($1,$2)',[client,target+'-01']);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table team_members(id uuid primary key,role text,is_active boolean);`);
  for (const name of ['20261118130000_social_studio.sql','20261120160000_social_studio_programs.sql'])
    await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  month = (await query<{m:string}>("select to_char(now() at time zone 'America/New_York','YYYY-MM') m"))[0].m;
  await query('insert into team_members values($1,\'admin\',true)',[actor]);
  await query("insert into social_programs(id,name,status,term_start,term_months) values($1,'Synthetic Program','active',$2,12)",[client,shiftMonth(month,2)+'-01']);
  await query("insert into social_accounts(id,program_id,name,posts_per_month) values($1,$2,'Synthetic Account',5)",[account,client]);
  await query("insert into social_content_items(account_id,month,kind,slot,pillar) values($1,$2,'post',1,'flexible')",[account,shiftMonth(month,-2)+'-01']);
  await db.exec(readFileSync('supabase/migrations/20261121110000_social_monthly_scope.sql','utf8'));
},60000);
afterAll(async () => {await db?.close();});

it('applies future term boundaries to both reporting and plan writes, preserving evidence from closed legacy plans',async()=>{
  const before = shiftMonth(month,1), first = shiftMonth(month,2), after = shiftMonth(first,12);
  expect(await scope(before)).toEqual([]);
  expect(await runPlan(before)).toBe(0);
  expect(await scope(after)).toEqual([]);
  expect(await runPlan(after)).toBe(0);
  expect(await scope(shiftMonth(month,-2))).toMatchObject([{posts_per_month:1,from_legacy_plan:true}]);
  expect(await scope(shiftMonth(month,-1))).toEqual([]);
  expect(await scope(first)).toMatchObject([{posts_per_month:5}]);
  expect(await runPlan(first)).toBe(5);
  expect(await runPlan(first)).toBe(0);
  const planned = await query<{kind:string,slot:number,pillar:string,scheduled_for:string}>("select kind,slot,pillar,scheduled_for::text from social_content_items where month=$1 order by slot",[first+'-01']);
  expect(planned).toEqual(planSlots({posts_per_month:5,reels_per_month:0,google_posts_per_month:0},first));
  await query("update social_accounts set posts_per_month=4,reels_per_month=1 where id=$1",[account]);
  expect(coveredSlots({posts_per_month:4,reels_per_month:1,google_posts_per_month:0},planned as ReturnType<typeof planSlots>)).toBe(4);
  expect(await runPlan(first)).toBe(1);
  const counts=await query("select kind,count(*)::int as n from social_content_items where month=$1 group by kind order by kind",[first+'-01']);
  expect(counts).toEqual([{kind:'post',n:5},{kind:'reel',n:1}]);
  await query("update social_content_items set scheduled_for=$1 where month=$2 and kind='reel'", [shiftMonth(first,1)+'-02',first+'-01']);
  const calendar = (m:string) => query<{kind:string}>('select kind from social_calendar_items($1,$2)',[client,m+'-01']);
  expect((await calendar(first)).some(r => r.kind==='reel')).toBe(false);
  expect(await calendar(shiftMonth(first,1))).toEqual([{kind:'reel'}]);
  await query("update social_accounts set is_active=false where id=$1",[account]);
  expect(await scope(first)).toEqual([]);
  expect(await scope(shiftMonth(month,-2))).toMatchObject([{posts_per_month:1}]);
});

it('uses the selected weekdays for partial January, February and July; the monthly reel stays separate',async()=>{
  const weeklyClient = randomUUID();
  const weeklyAccount = randomUUID();
  await query("insert into social_programs(id,name,status,term_start,term_months) values($1,'Weekly Example','active','2027-01-15',12)",[weeklyClient]);
  await query("insert into social_accounts(id,program_id,name,post_weekdays,posts_per_month,reels_per_month) values($1,$2,'Weekly Account',array[2,5],9,1)",[weeklyAccount,weeklyClient]);
  // Pin the effective date so this test is deterministic on future CI clocks.
  await query("update social_scope_history set effective_month='2026-11-01' where account_id=$1",[weeklyAccount]);
  for (const [target,expected] of [
    ['2027-01', [15,19,22,26,29]], ['2027-02', [2,5,9,12,16,19,23,26]], ['2027-07',[2,6,9,13,16,20,23,27,30]],
  ] as const) {
    const date=target+'-01';
    const [quota]=await query<{posts_per_month:number,reels_per_month:number}>('select * from social_month_scope($1,$2)',[weeklyClient,date]);
    expect(quota).toMatchObject({posts_per_month:expected.length,reels_per_month:1});
    const [result]=await query<{n:number}>('select social_plan_month($1,$2,$3) n',[weeklyClient,date,actor]);
    expect(result.n).toBe(expected.length+1);
    const posts=await query<{calendar_day:number,status:string}>("select extract(day from scheduled_for)::int as calendar_day,status from social_content_items where account_id=$1 and month=$2 and kind='post' order by slot",[weeklyAccount,date]);
    expect(posts.map(p=>p.calendar_day)).toEqual(expected);
    expect(posts.every(p=>p.status==='planned')).toBe(true);
  }
  await expect(query("update social_accounts set post_weekdays=array[2,2] where id=$1",[weeklyAccount])).rejects.toThrow();
  await expect(query("update social_accounts set post_weekdays=array[7] where id=$1",[weeklyAccount])).rejects.toThrow();
});

it('counts duplicate and surplus slots by kind and honors end-exclusive terms',()=>{
  expect(coveredSlots({posts_per_month:2,reels_per_month:1,google_posts_per_month:0},
    [{kind:'post',slot:1},{kind:'post',slot:1},{kind:'post',slot:3},{kind:'reel',slot:1}])).toBe(2);
  expect(contractMonthState('2026-11',{term_start:'2027-01-01',term_months:12})).toBe('before');
  expect(contractMonthState('2027-12',{term_start:'2027-01-01',term_months:12})).toBe('in_term');
  expect(contractMonthState('2028-01',{term_start:'2027-01-01',term_months:12})).toBe('after');
});

it('reads more than 1,000 rows and stops after the short page',async()=>{
  const source=Array.from({length:1123},(_,n)=>n);
  const rows=await readSocialPages<number>((from,to)=>Promise.resolve({data:source.slice(from,to+1),error:null}));
  expect(rows).toEqual(source);
});
