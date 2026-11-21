import { expect, it, vi } from "vitest";
import { actionSchema } from "./schema";
import { runAction } from "./server";

const generateText = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({text:"A synthetic draft."})));
vi.mock("@/lib/operations/providers", () => ({ generateText, providerConfigured: () => true }));
vi.mock("@/lib/operations/settings", () => ({ parseSettings: () => ({ agents:{handoff:{provider:"openai"}} }) }));
vi.mock("@/lib/crm/server", async () => ({
  ...(await vi.importActual<typeof import("@/lib/crm/server")>("@/lib/crm/server")),
  crmDb: () => ({
    from(table: string) {
      const fixture: Record<string,unknown> = {
        social_content_items:{ account_id:"acct", kind:"post", title:"", pillar:"flexible", scheduled_for:null },
        social_accounts:{ program_id:"program", name:"Example", platforms:["instagram"], voice_notes:"Brief", avoid_terms:[] },
        social_programs:{ avoid_terms:[] }, ops_agent_settings:{},
      };
      const query = {select:() => query, eq:() => query, maybeSingle:() => ({data:fixture[table],error:null})};
      return query;
    },
  }),
}));

it("drafts from the unsaved title, content type and date currently in the editor",async()=>{
  const action = actionSchema.parse({action:"draft_caption",id:"55555555-5555-4555-a555-555555555555",
    context:{title:"Lobby exhibition opens",pillar:"local_event",scheduled_for:"2027-01-15"}});
  expect(await runAction("staff",action)).toEqual({caption:"A synthetic draft."});
  const args = generateText.mock.calls[0];
  expect(JSON.parse(String(args[2]))).toMatchObject({topic:"Lobby exhibition opens",content_type:"Local event",publish_date:"2027-01-15"});
});
