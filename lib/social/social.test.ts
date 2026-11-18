import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ actor: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/crm/server", async () => ({
  ...(await vi.importActual<typeof import("@/lib/crm/server")>("@/lib/crm/server")),
  crmActor: mock.actor,
}));
vi.mock("./server", () => ({ runAction: mock.run }));

import { POST } from "@/app/api/social/route";
import { CrmError } from "@/lib/crm/server";
import {
  actionSchema,
  countByStatus,
  isLate,
  mediaHealth,
  monthLabel,
  parseAccountLines,
  parseMonth,
  planSlots,
  platformOf,
  shiftMonth,
  sumOf,
  todayKey,
  DONE,
  TIER_DEFAULTS,
} from "./schema";

const origin = "https://app.oceanoblue.net";
const id = "11111111-1111-4111-8111-111111111111";
const req = (body: unknown, from = origin) =>
  new Request(`${origin}/api/social`, {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  mock.actor.mockResolvedValue(id);
  mock.run.mockResolvedValue({ created: 3 });
});
afterEach(() => vi.unstubAllEnvs());

describe("months", () => {
  it("uses the month in the address only when it is a real month", () => {
    const now = new Date("2026-11-18T14:00:00Z");
    expect(parseMonth("2027-01", now)).toBe("2027-01");
    for (const bad of ["2027-13", "2027-1", "next", undefined, ["2027-01"]]) expect(parseMonth(bad, now)).toBe("2026-11");
  });
  it("takes today from the business timezone, not UTC", () => {
    // 2:30 AM UTC on Dec 1 is still Nov 30 in New York.
    expect(todayKey(new Date("2026-12-01T02:30:00Z"), "America/New_York")).toBe("2026-11-30");
  });
  it("moves across year ends", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(monthLabel("2027-01")).toBe("January 2027");
  });
});

describe("planning", () => {
  it("gives a standard account 5 posts in the agreed mix and 1 reel, spread across the month", () => {
    const slots = planSlots(TIER_DEFAULTS.standard, "2027-01");
    expect(slots.filter((s) => s.kind === "post").map((s) => s.pillar)).toEqual([
      "property_feature", "local_event", "property_feature", "local_story", "flexible",
    ]);
    expect(slots.filter((s) => s.kind === "post").map((s) => s.scheduled_for)).toEqual([
      "2027-01-01", "2027-01-07", "2027-01-13", "2027-01-19", "2027-01-25",
    ]);
    expect(slots.filter((s) => s.kind === "reel")).toEqual([{ kind: "reel", slot: 1, pillar: "video", scheduled_for: "2027-01-03" }]);
  });
  it("staggers accounts so the same quota does not pile onto the same dates, without changing the slots", () => {
    const first = planSlots(TIER_DEFAULTS.standard, "2027-01", 0);
    const fourth = planSlots(TIER_DEFAULTS.standard, "2027-01", 3);
    expect(fourth.filter((s) => s.kind === "post").map((s) => s.scheduled_for)).toEqual([
      "2027-01-04", "2027-01-10", "2027-01-16", "2027-01-22", "2027-01-28",
    ]);
    expect(fourth.map((s) => `${s.kind}:${s.slot}:${s.pillar}`)).toEqual(first.map((s) => `${s.kind}:${s.slot}:${s.pillar}`));
    // 27 standard accounts use every day of the month's first week-long gap.
    const used = new Set(Array.from({ length: 27 }, (_, i) => planSlots(TIER_DEFAULTS.standard, "2027-01", i)[0].scheduled_for));
    expect(used.size).toBe(6);
  });
  it("plans every tier's full quota with unique slots and dates inside the month, February included", () => {
    for (const [offset, tier] of Object.values(TIER_DEFAULTS).entries()) {
      const slots = planSlots(tier, "2027-02", offset * 11);
      expect(slots).toHaveLength(tier.posts_per_month + tier.reels_per_month + tier.google_posts_per_month);
      expect(new Set(slots.map((s) => `${s.kind}:${s.slot}`)).size).toBe(slots.length);
      for (const s of slots) expect(s.scheduled_for >= "2027-02-01" && s.scheduled_for <= "2027-02-28").toBe(true);
    }
    expect(planSlots({ posts_per_month: 0, reels_per_month: 0, google_posts_per_month: 0 }, "2027-02")).toEqual([]);
  });
  it("is repeatable, so planning twice asks for the same slots", () => {
    expect(planSlots(TIER_DEFAULTS.high_volume, "2027-03")).toEqual(planSlots(TIER_DEFAULTS.high_volume, "2027-03"));
  });
});

describe("media supply and progress", () => {
  const quota = { posts_per_month: 5, reels_per_month: 1, google_posts_per_month: 0 };
  it("judges supply by whichever of photos or clips runs out first", () => {
    expect(mediaHealth(quota, { photos: 10, videos: 6 })).toBe("good");
    expect(mediaHealth(quota, { photos: 40, videos: 3 })).toBe("low");
    expect(mediaHealth(quota, { photos: 40, videos: 2 })).toBe("out");
    expect(mediaHealth(quota, { photos: 0, videos: 0 })).toBe("out");
    expect(mediaHealth({ ...quota, posts_per_month: 0, reels_per_month: 0 }, { photos: 0, videos: 0 })).toBe("good");
  });
  it("counts scheduled and published as done, and flags past-due work only", () => {
    const counts = countByStatus([{ status: "scheduled" }, { status: "published" }, { status: "in_design" }]);
    expect(sumOf(counts, DONE)).toBe(2);
    expect(isLate({ status: "in_design", scheduled_for: "2027-01-04" }, "2027-01-05")).toBe(true);
    expect(isLate({ status: "in_design", scheduled_for: "2027-01-05" }, "2027-01-05")).toBe(false);
    expect(isLate({ status: "scheduled", scheduled_for: "2027-01-04" }, "2027-01-05")).toBe(false);
    expect(isLate({ status: "planned", scheduled_for: null }, "2027-01-05")).toBe(false);
  });
});

describe("pasted account lists", () => {
  it("reads names with their profile links and drops blanks and repeats", () => {
    expect(
      parseAccountLines(
        [
          "Hampton Inn Example | https://www.facebook.com/hamptonexample | https://www.instagram.com/hamptonexample/",
          "",
          "  Salt  Beachside Bar ",
          "salt beachside bar",
          "Hyatt Place Example\thttps://www.linkedin.com/company/hyatt-example",
        ].join("\n"),
      ),
    ).toEqual([
      { name: "Hampton Inn Example", profile_links: { facebook: "https://www.facebook.com/hamptonexample", instagram: "https://www.instagram.com/hamptonexample/" } },
      { name: "Salt Beachside Bar", profile_links: {} },
      { name: "Hyatt Place Example", profile_links: { linkedin: "https://www.linkedin.com/company/hyatt-example" } },
    ]);
  });
  it("recognizes platforms by host and ignores look-alikes and non-https links", () => {
    expect(platformOf("https://m.facebook.com/x")).toBe("facebook");
    expect(platformOf("https://youtu.be/x")).toBe("youtube");
    expect(platformOf("https://facebook.com.evil.test/x")).toBeNull();
    expect(platformOf("http://www.facebook.com/x")).toBeNull();
    expect(platformOf("not a link")).toBeNull();
  });
});

describe("requests", () => {
  it("accepts a normal change and rejects unsafe or empty ones", () => {
    expect(actionSchema.safeParse({ action: "update_item", id, patch: { status: "approved", scheduled_for: null, design_url: "https://www.canva.com/design/abc" } }).success).toBe(true);
    for (const bad of [
      { action: "update_item", id, patch: {} },
      { action: "update_item", id, patch: { status: "done" } },
      { action: "update_item", id, patch: { design_url: "javascript:alert(1)" } },
      { action: "update_item", id, patch: { design_url: "http://www.canva.com/design/abc" } },
      { action: "update_item", id, patch: { scheduled_for: "2027-02-31x" } },
      { action: "update_account", id, patch: { posts_per_month: 61 } },
      { action: "update_account", id, patch: { profile_links: { myspace: "https://myspace.com/x" } } },
      { action: "add_media", account_id: id, received_on: "2027-01-05", source: "client_visit", photos: 0, videos: 0 },
      { action: "add_accounts", program_id: id, tier: "standard", accounts: [] },
      { action: "plan_month", program_id: id, month: "2027-13" },
      { action: "delete_everything" },
    ])
      expect(actionSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it("saves a valid change for an office user on the live system", async () => {
    const res = await POST(req({ action: "plan_month", program_id: id, month: "2027-01" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: 3 });
    expect(mock.run).toHaveBeenCalledWith(id, { action: "plan_month", program_id: id, month: "2027-01" });
  });
  it("refuses people without office access, other sites, previews and bad input, and saves nothing", async () => {
    mock.actor.mockRejectedValueOnce(new CrmError("Office access is required.", 403));
    expect((await POST(req({ action: "plan_month", program_id: id, month: "2027-01" }))).status).toBe(403);
    expect((await POST(req({ action: "plan_month", program_id: id, month: "2027-01" }, "https://evil.test"))).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await POST(req({ action: "plan_month", program_id: id, month: "2027-01" }))).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(req({ action: "plan_month", program_id: id, month: "soon" }))).status).toBe(400);
    expect(mock.run).not.toHaveBeenCalled();
  });
});

describe("database", () => {
  let db: PGlite;
  const office = randomUUID();
  const field = randomUUID();
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      create table team_members(id uuid primary key, full_name text, role text, is_active boolean);
      grant select on team_members to authenticated, service_role;
      insert into team_members values ('${office}','Office','admin',true), ('${field}','Field','photographer',true);`);
    await db.exec(readFileSync("supabase/migrations/20261118130000_social_studio.sql", "utf8"));
  }, 60000);
  afterAll(async () => await db?.close());
  const rows = async (sql: string, args: unknown[] = []) => (await db.query<any>(sql, args)).rows;

  it("keeps one row per slot so a month can be planned twice, and rejects values the app does not know", async () => {
    const [{ id: program }] = await rows("insert into social_programs(name) values('Test Hotels') returning id");
    const [{ id: account }] = await rows("insert into social_accounts(program_id,name,platforms,posts_per_month) values($1,'Hotel One','{facebook,instagram}',5) returning id", [program]);
    const insert = "insert into social_content_items(account_id,month,kind,slot,pillar) values($1,'2027-01-01','post',1,'property_feature') on conflict (account_id,month,kind,slot) do nothing returning id";
    expect(await rows(insert, [account])).toHaveLength(1);
    expect(await rows(insert, [account])).toHaveLength(0);
    await expect(rows("insert into social_accounts(program_id,name) values($1,'Hotel One')", [program])).rejects.toThrow();
    await expect(rows("insert into social_accounts(program_id,name,platforms) values($1,'Hotel Two','{myspace}')", [program])).rejects.toThrow();
    await expect(rows("insert into social_content_items(account_id,month,kind,slot,pillar) values($1,'2027-01-15','post',2,'flexible')", [account])).rejects.toThrow();
    await expect(rows("insert into social_media_batches(account_id,received_on,source) values($1,'2027-01-05','client_visit')", [account])).rejects.toThrow();
  });
  it("lets office staff read, hides everything from field staff and the public, and lets nobody write from the browser", async () => {
    const as = async (role: string, who: string | null, sql: string) => {
      await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub','${who ?? ""}',true);`);
      try {
        return (await db.query<any>(sql)).rows;
      } finally {
        await db.exec("rollback");
      }
    };
    expect((await as("authenticated", office, "select name from social_programs")).length).toBeGreaterThan(0);
    expect(await as("authenticated", field, "select name from social_programs")).toHaveLength(0);
    await expect(as("anon", null, "select name from social_programs")).rejects.toThrow();
    await expect(as("authenticated", office, "insert into social_programs(name) values('x')")).rejects.toThrow();
    await expect(as("authenticated", office, "update social_content_items set status='published'")).rejects.toThrow();
  });
});
