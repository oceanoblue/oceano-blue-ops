import { describe,it,expect,vi,afterEach } from "vitest";
import { beginMeta,verifyMetaState,matchPages } from "./meta-connection";
import { reportingAction } from "./reporting";
const account="8a466701-e18e-41c8-a6d5-d12e2964f5eb";
afterEach(()=>vi.unstubAllEnvs());
describe("read-only account connections",()=>{
  it("matches only the saved company identities and selected platforms",()=>{
    const pages=[{id:"1234",link:"https://www.facebook.com/Example/",name:"Example",access_token:"sample_token",instagram_business_account:{id:"789",username:"ExampleSocial"}}];
    expect(matchPages(pages,{facebook:"https://facebook.com/example",instagram:"https://instagram.com/OTHER"},["facebook","instagram"]).map(x=>x.platform)).toEqual(["facebook"]);
    expect(matchPages(pages,{instagram:"https://instagram.com/examplesocial"},["instagram"]).map(x=>x.remote_id)).toEqual(["789"]);
    expect(matchPages(pages,{facebook:"https://other.example/Example"},["facebook"])).toEqual([]);
  });
  it("binds the expiring consent to the office user and account with no publish scope",()=>{
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY",Buffer.alloc(32,7).toString("base64"));
    vi.stubEnv("SOCIAL_META_APP_ID","123");
    const auth=beginMeta("office-a",account,"https://example.org/callback");
    const u=new URL(auth.url);const state=u.searchParams.get("state")!;
    expect(u.searchParams.get("scope")!.split(",")).toEqual(["pages_show_list","pages_read_engagement","instagram_basic"]);
    expect(verifyMetaState(auth.saved,state,"office-a")).toBe(account);
    expect(verifyMetaState(auth.saved,state,"office-b")).toBeNull();
    expect(verifyMetaState(auth.saved,state.slice(1),"office-a")).toBeNull();
  });
  it("accepts only secure client report links and valid reporting months",()=>{
    const form={action:"report",program:account,month:"2027-01",source:"Publisher",url:"https://example.org/report"};
    expect(reportingAction.safeParse(form).success).toBe(true);
    expect(reportingAction.safeParse({...form,url:"javascript:alert(1)"}).success).toBe(false);
    expect(reportingAction.safeParse({...form,month:"2027-13"}).success).toBe(false);
  });
});
