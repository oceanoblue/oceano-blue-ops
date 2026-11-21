import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as submit } from "@/app/api/social-onboarding/route";
import { POST as upload } from "@/app/api/social-onboarding/files/route";
import { POST as office } from "@/app/api/crm/social-onboarding/route";
import { GET as download } from "@/app/api/crm/social-onboarding/files/[id]/route";
import { POST as agreementAction } from "@/app/api/social/route";
import { POST as sign } from "@/app/api/social-public/agreements/[token]/route";
import { cleanExpiredIntakeObjects } from "./server";
import { publicAgreement } from "@/lib/social/server";

const actor = randomUUID();
const mail = vi.hoisted(() => vi.fn(async (_params: Record<string, unknown>) => ({status:"sent",id:"captured-mail"})));
vi.mock("@/lib/email/resend", () => ({sendEmail:mail, isEmailConfigured:()=>true, defaultReplyTo:()=>"office@example.test"}));
vi.mock("@/lib/crm/inquiry-server", () => ({inquiryOfficeConfig:() => ({enabled:true,recipient:"office@example.test"})}));
vi.mock("@/lib/crm/server", async original => ({
  ...(await original<typeof import("@/lib/crm/server")>()), crmDb:()=>adapter, crmActor:async()=>actor,
}));

const pg = new PGlite();
const objects = new Map<string, Buffer>();
const bucket = {
  async info(path:string) {
    const bytes=objects.get(path);
    return bytes ? {data:{size:bytes.length},error:null} : {data:null,error:{message:"missing"}};
  },
  async copy(from:string,to:string) {
    const bytes=objects.get(from);
    if (!bytes) return {error:{message:"missing"}};
    objects.set(to,Buffer.from(bytes));
    return {error:null};
  },
  async remove(paths:string[]) { paths.forEach(path=>objects.delete(path)); return {error:null}; },
  async createSignedUploadUrl(path:string) { return {data:{token:"test-ticket",signedUrl:`https://storage.example.test/${path}`},error:null}; },
  async createSignedUrl(path:string) { return {data:{signedUrl:`https://storage.example.test/${path}`},error:null}; },
};
type Row = Record<string,unknown>;

// Execute the server's small subset of PostgREST queries against real PostgreSQL semantics.
// Only identifiers from application code become SQL. All row values are parameters.
function identifier(s:string) {
  if (!/^[a-z_]+$/.test(s)) throw Error("Invalid test SQL identifier");
  return '"'+s+'"';
}
function tableQuery(table:string) {
  let verb="select", columns="*", fields:Row={};
  const where:[string,unknown][]=[];
  const args:unknown[]=[];
  const bind=(value:unknown)=>{args.push(value);return '$'+args.length;};
  const execute=async()=>{
    const names=Object.keys(fields);
    const projection=columns==="*"?"*":columns.split(",").map(identifier).join(",");
    let sql = verb==="select" ? `select ${projection} from ${identifier(table)}` : verb==="update"
      ? `update ${identifier(table)} set ${names.map(key=>identifier(key)+'='+bind(fields[key])).join(",")}`
      : `insert into ${identifier(table)} (${names.map(identifier).join(",")}) values (${names.map(key=>bind(fields[key])).join(",")})`;
    if (where.length) sql+=' where '+where.map(([key,value])=>Array.isArray(value)
      ? `${identifier(key)} in (${value.map(bind).join(",")})` : `${identifier(key)}=${bind(value)}`).join(" and ");
    if (verb!=="select") sql+=" returning "+projection;
    try { return {data:(await pg.query<Row>(sql,args)).rows,error:null}; }
    catch(e){return {data:[],error:e as Error};}
  };
  const q={
    select(c:string){columns=c;return q;},
    eq(c:string,v:unknown){where.push([c,v]);return q;},
    in(c:string,v:unknown[]){where.push([c,v]);return q;},
    update(p:Row){verb="update";fields=p;return q;},
    insert(p:Row){verb="insert";fields=p;return q;},
    async single(){const r=await execute();return {...r,data:r.data[0]??null};},
    async maybeSingle(){return q.single();},
    then(resolve:(value:unknown)=>unknown){return execute().then(resolve);},
  };
  return q;
}
const adapter={
  from:tableQuery,
  storage:{from:()=>bucket},
  async rpc(name:string,args:Row = {}) {
    if(name==="bump_rate_limit") return {data:1,error:null};
    if(name==="social_expired_intake_objects") return {data:(await pg.query<Row>("select * from social_expired_intake_objects()")).rows,error:null};
    const keys=Object.keys(args);
    const sql=`select public.${identifier(name)}(${keys.map((key,i)=>identifier(key)+" => $"+(i+1)).join(",")}) as result`;
    try{return {data:(await pg.query<Row>(sql,Object.values(args))).rows[0].result,error:null};}
    catch(e){return {data:null,error:e as Error};}
  },
};

const base="https://studio.example.test";
const req=(path:string,body:unknown)=>new Request(base+path,{method:"POST",headers:{origin:base,"content-type":"application/json"},body:JSON.stringify(body)});
beforeAll(async()=>{
  vi.stubEnv("VERCEL_ENV","production"); // Routes only; delivery is always intercepted above.
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table team_members(id uuid primary key,role text,is_active boolean); create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,created_at timestamptz);`);
  await pg.query("insert into team_members values($1,'admin',true)",[actor]);
  for (const migration of ["20261113140000_social_onboarding","20261118130000_social_studio","20261120160000_social_studio_programs","20261120190000_social_studio_clients"]) {
    await pg.exec(await readFile(new URL(`../../supabase/migrations/${migration}.sql`,import.meta.url),"utf8"));
  }
  // The approval-workflow migration owns this column; this suite isolates the intake migration.
  await pg.exec("alter table social_programs add column approval_mode text not null default 'individual' check(approval_mode in ('office','individual','batch'))");
  await pg.exec(await readFile(new URL("../../supabase/migrations/20261121120000_social_intake_workflow.sql",import.meta.url),"utf8"));
});
afterAll(async()=>{await pg.close();vi.unstubAllEnvs();});
beforeEach(()=>{mail.mockClear();objects.clear();});
const submitIntake=async(approval:string)=>{
  const id=randomUUID(),token="x".repeat(43);
  const body={submission_id:id,upload_token:token,expected_files:1,answers:{
    business_name:"Synthetic Hotel",contact_name:"Test Client",email:"client@example.test",package:"Social Media Management",
    brand_guide:"No, please create a look for us",goal:"Reach visitors",approval,platforms:{},
  }};
  const result=await submit(req("/api/social-onboarding",body));
  expect(await result.json()).toEqual({ok:true});
  return {id,token,body};
};
const callOffice=async(action:unknown)=>(await agreementAction(req("/api/social",action)));
describe("public intake, office handoff and signatures with local-only providers",()=>{
  it("submits once, captures the office email, verifies and seals a file, then links the intake once",async()=>{
    const intake=await submitIntake("Send me the month's calendar to approve");
    expect((await submit(req("/api/social-onboarding",intake.body))).status).toBe(200);
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail).toHaveBeenCalledWith(expect.objectContaining({to:"office@example.test",replyTo:"client@example.test"}));
    const file_id=randomUUID();
    const target={submission_id:intake.id,upload_token:intake.token,file_id};
    const ticket=()=>upload(req("/api/social-onboarding/files",{action:"sign",...target,name:"guide.pdf",size:4,content_type:"application/pdf"}));
    const done=()=>upload(req("/api/social-onboarding/files",{action:"done",...target}));
    const signed=await (await ticket()).json();
    expect(signed).toMatchObject({ok:true,already_uploaded:false});
    objects.set(signed.path,Buffer.from("incorrect-size"));
    expect((await done()).status).toBe(409);
    expect(objects.has(signed.path)).toBe(false);
    expect((await ticket()).status).toBe(200);
    objects.set(signed.path,Buffer.from("file"));
    // Recover a lost confirmation on retry without uploading the bytes again.
    expect(await (await ticket()).json()).toEqual({ok:true,already_uploaded:true});
    expect((await done()).status).toBe(200);
    const redirected=await download(new Request(base),{params:Promise.resolve({id:file_id})});
    expect(redirected.status).toBe(302);
    const final=new URL(redirected.headers.get("location")!).pathname.slice(1);
    objects.set(signed.path,Buffer.from("different bytes in old staging path"));
    expect(objects.get(final)?.toString()).toBe("file");
    await pg.query("insert into storage.objects values('social-onboarding',$1,now()-interval '3 days'),('social-onboarding',$2,now()-interval '3 days')",[signed.path,final]);
    expect(await cleanExpiredIntakeObjects()).toBe(1);
    expect(objects.has(signed.path)).toBe(false);
    expect(objects.get(final)?.toString()).toBe("file");
    const convert=async()=> (await office(req("/api/crm/social-onboarding",{action:"link_program",id:intake.id,program_id:null}))).json();
    const [first,second]=await Promise.all([convert(),convert()]);
    expect(second.program_id).toBe(first.program_id);
    expect((await pg.query<Row>("select approval_mode from social_programs where id=$1",[first.program_id])).rows[0].approval_mode).toBe("batch");
  });
  it("imports each explicit preference and preserves existing terms when linking an existing program",async()=>{
    const {rows:[program]}=await pg.query<Row>("insert into social_programs(name,monthly_fee_cents) values('Existing client',12345) returning id");
    for(const [choice,mode] of [["Send me each post to approve","individual"],["I trust you, post without approval","office"]]){
      const intake=await submitIntake(choice);
      expect((await office(req("/api/crm/social-onboarding",{action:"link_program",id:intake.id,program_id:program.id}))).status).toBe(200);
      expect((await pg.query<Row>("select approval_mode,monthly_fee_cents from social_programs where id=$1",[program.id])).rows[0]).toEqual({approval_mode:mode,monthly_fee_cents:12345});
    }
  });
  it("reserves the last available byte capacity once and accepts identical retries", async()=>{
    const {id}=await submitIntake("Send me each post to approve");
    const reserve=(file:string)=>adapter.rpc("social_reserve_intake_file",{p_intake:id,p_file:file,p_path:file,p_name:"clip.mp4",p_kind:"video",p_mime:"video/mp4",p_bytes:2147483648});
    for(let i=0;i<4;i++)expect((await reserve(randomUUID())).data).toBe("reserved");
    const ids=[randomUUID(),randomUUID()];const results=await Promise.all(ids.map(reserve));
    expect(results.filter(r=>r.data==="reserved")).toHaveLength(1);
    expect(results.find(r=>r.error)?.error?.message).toBe("intake_bytes");
    expect((await reserve(ids[results.findIndex(r=>r.data==="reserved")])).data).toBe("pending");
  });
  it("refuses unresolved fields, signs once, sends a captured alert, and commits the checklist with the countersignature",async()=>{
    const intake=await submitIntake("Send me each post to approve");
    const {program_id}=await (await office(req("/api/crm/social-onboarding",{action:"link_program",id:intake.id,program_id:null}))).json();
    const {id}=await (await callOffice({action:"create_agreement",program_id,title:"Agreement",body:"Fee: [FEE]"})).json();
    expect((await callOffice({action:"send_agreement",id})).status).toBe(409);
    await callOffice({action:"update_agreement",id,title:"Agreement",body:"Example terms"});
    const {token}=await (await callOffice({action:"send_agreement",id})).json();
    const doc=await publicAgreement(token);
    const accept=()=>sign(req("/api/sign",{signer_name:"Test Signer",signer_title:"Owner",signer_email:"signer@example.test",consent:true,document_hash:doc!.document_hash}),{params:Promise.resolve({token})});
    expect((await accept()).status).toBe(200);
    expect((await accept()).status).toBe(409);
    expect(mail).toHaveBeenCalledTimes(2);
    const step=()=>callOffice({action:"set_onboarding_step",id:program_id,step:"style_approved",done:true});
    const countersign=()=>callOffice({action:"countersign_agreement",id,signer_name:"Test Office",signer_title:"Partner",consent:true});
    // A database failure while ticking the checklist must roll back the signature too.
    await pg.exec("alter table social_programs add constraint synthetic_failure check (not (onboarding ? 'agreement_signed'))");
    expect((await countersign()).status).toBe(503);
    expect((await publicAgreement(token))?.status).toBe("client_signed");
    await pg.exec("alter table social_programs drop constraint synthetic_failure");
    const results=await Promise.all([step(),countersign()]);
    expect(results.map(r=>r.status)).toEqual([200,200]);
    expect((await publicAgreement(token))?.status).toBe("signed");
    const {rows:[result]}=await pg.query<Row>("select onboarding from social_programs where id=$1",[program_id]);
    expect(result.onboarding).toMatchObject({agreement_signed:expect.stringMatching(/^\d{4}-/),style_approved:expect.any(String)});
  });
});
