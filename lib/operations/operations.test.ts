import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/google-calendar/api", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));
import { dayBounds, localClock, shouldRun } from "./time";
import {
  calendarEvents,
  findConflicts,
  classify,
  prioritize,
} from "./snapshot";
import { generateAgent, listModels } from "./providers";
import {
  DEFAULT_SETTINGS,
  type DayEvent,
  type OperationsSnapshot,
  type WorkItem,
} from "./types";
import { settingsSchema } from "./settings";
import { GET as cron } from "@/app/api/cron/daily-operations/route";
const snapshot: OperationsSnapshot = {
  capturedAt: "2026-09-24T11:00:00Z",
  day: "2026-09-24",
  timezone: "America/New_York",
  calendar: { status: "disconnected", message: "Connect calendar" },
  items: [],
  events: [],
  conflicts: [],
  warnings: [],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("local-day scheduling", () => {
  it("uses Eastern calendar date across UTC midnight", () => {
    expect(
      localClock(new Date("2026-09-25T01:00:00Z"), "America/New_York"),
    ).toEqual({ date: "2026-09-24", time: "21:00" });
  });
  it("handles 23-hour and 25-hour DST days", () => {
    expect(dayBounds("2026-03-08", "America/New_York")).toEqual({
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T04:00:00.000Z",
    });
    expect(dayBounds("2026-11-01", "America/New_York")).toEqual({
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T05:00:00.000Z",
    });
  });
  it("catches up after scheduled time, respects pause and seasonal offsets", () => {
    expect(shouldRun(new Date("2026-09-24T10:59:00Z"), DEFAULT_SETTINGS)).toBe(
      false,
    );
    expect(shouldRun(new Date("2026-09-24T11:15:00Z"), DEFAULT_SETTINGS)).toBe(
      true,
    );
    expect(shouldRun(new Date("2026-12-24T11:15:00Z"), DEFAULT_SETTINGS)).toBe(
      false,
    );
    expect(
      shouldRun(new Date("2026-12-24T12:15:00Z"), {
        ...DEFAULT_SETTINGS,
        enabled: false,
      }),
    ).toBe(false);
  });
  it("rejects bad timezone, malformed times and empty AI model choices", () => {
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, timezone: "unknown" })
        .success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, brief_time: "25:00" })
        .success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        agents: {
          ...DEFAULT_SETTINGS.agents,
          planner: { provider: "openai", model: "" },
        },
      }).success,
    ).toBe(false);
  });
});
describe("calendar coverage", () => {
  it("preserves all-day dates and follows pagination", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              id: "all",
              summary: "Travel",
              start: { date: "2026-09-24" },
              end: { date: "2026-09-25" },
            },
          ],
          nextPageToken: "p2",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              id: "meeting",
              start: { dateTime: "2026-09-24T09:00:00-04:00" },
              end: { dateTime: "2026-09-24T10:00:00-04:00" },
            },
            {
              id: "declined",
              attendees: [{ self: true, responseStatus: "declined" }],
              start: { date: "2026-09-24" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", f);
    const result = await calendarEvents(
      "user",
      "2026-09-24",
      "America/New_York",
    );
    expect(result).toHaveLength(2);
    expect(result[0].start).toBe("2026-09-24");
    expect(result[0].allDay).toBe(true);
    expect(String(f.mock.calls[1][0])).toContain("pageToken=p2");
  });
  it("never turns provider errors into a free day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    await expect(
      calendarEvents("user", "2026-09-24", "America/New_York"),
    ).rejects.toThrow("unverified");
  });
  it("detects nested overlaps without flagging adjacent events or all-day labels", () => {
    const event = (id: string, start: string, end: string, allDay = false) =>
      ({
        id,
        start: `2026-09-24T${start}:00Z`,
        end: `2026-09-24T${end}:00Z`,
        allDay,
        title: id,
        source: "calendar",
        href: null,
      }) as DayEvent;
    expect(
      findConflicts([
        event("a", "09:00", "12:00"),
        event("b", "10:00", "11:00"),
        event("c", "12:00", "13:00"),
        event("d", "08:00", "17:00", true),
      ]),
    ).toEqual([["a", "b"]]);
  });
});
describe("agents", () => {
  it("produces useful rules without provider credentials or network calls", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const result = await generateAgent(
      "planner",
      { provider: "rules", model: "" },
      snapshot,
    );
    expect(result.text).toContain("Connect calendar");
    expect(f).not.toHaveBeenCalled();
  });
  it("uses the selected OpenAI model and disables response storage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const f = vi.fn(async () =>
      Response.json({
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "Plan" }] }],
        usage: { input_tokens: 30, output_tokens: 4 },
      }),
    );
    vi.stubGlobal("fetch", f);
    expect(
      await generateAgent(
        "planner",
        { provider: "openai", model: "gpt-test" },
        snapshot,
      ),
    ).toMatchObject({ text: "Plan", inputTokens: 30, outputTokens: 4 });
    expect(
      JSON.parse(
        (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
      ),
    ).toMatchObject({
      model: "gpt-test",
      store: false,
      max_output_tokens: 2500,
    });
  });
  it("uses Anthropic Messages and refuses incomplete results", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const f = vi.fn(async () =>
      Response.json({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "Incomplete" }],
      }),
    );
    vi.stubGlobal("fetch", f);
    await expect(
      generateAgent(
        "handoff",
        { provider: "anthropic", model: "claude-test" },
        snapshot,
      ),
    ).rejects.toThrow("did not finish");
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain(
      "/messages",
    );
  });
  it("surfaces failures without leaking provider response bodies", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("private business content", { status: 429 }),
      ),
    );
    await expect(
      generateAgent(
        "planner",
        { provider: "openai", model: "gpt-test" },
        snapshot,
      ),
    ).rejects.toThrow("Provider request failed (429)");
  });
  it("loads available model IDs from the actual account and excludes image/audio models", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            { id: "gpt-test" },
            { id: "gpt-image-test" },
            { id: "whisper-1" },
          ],
        }),
      ),
    );
    expect(await listModels("openai")).toEqual([
      { id: "gpt-test", name: "gpt-test" },
    ]);
  });
  it("classifies existing production vocabulary and sorts urgent work first", () => {
    expect(classify("media_received")).toBe("prepare");
    expect(classify("ready_to_deliver")).toBe("deliver");
    const make = (id: string, overdue: boolean, rush: boolean) =>
      ({ id, overdue, rush, due: null, updated: "2026-09-20" }) as WorkItem;
    expect(
      prioritize([
        make("normal", false, false),
        make("rush", false, true),
        make("late", true, false),
      ]).map((i) => i.id),
    ).toEqual(["late", "rush", "normal"]);
  });
  it("rejects cron requests if secret is missing or incorrect", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(
      (
        await cron(
          new Request("http://localhost/api/cron/daily-operations", {
            headers: { authorization: "Bearer undefined" },
          }),
        )
      ).status,
    ).toBe(401);
    vi.stubEnv("CRON_SECRET", "secret");
    expect(
      (await cron(new Request("http://localhost/api/cron/daily-operations")))
        .status,
    ).toBe(401);
  });
});

it("compares calendar instants across mixed timezone offsets", () => {
  const e = (id: string, start: string, end: string): DayEvent => ({
    id,
    title: id,
    start,
    end,
    allDay: false,
    source: "calendar",
    href: null,
  });
  expect(
    findConflicts([
      e("late", "2026-09-24T12:00:00-04:00", "2026-09-24T13:00:00-04:00"),
      e("early", "2026-09-24T13:00:00Z", "2026-09-24T14:00:00Z"),
      e("overlap", "2026-09-24T09:30:00-04:00", "2026-09-24T10:00:00-04:00"),
    ]),
  ).toEqual([["early", "overlap"]]);
});
