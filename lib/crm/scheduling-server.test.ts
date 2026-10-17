import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), busy: vi.fn(), scope: "", blocks: [] as any[], external: [] as any[] }));
vi.mock("./server", () => ({ crmDb: () => ({ from: m.from, rpc: m.rpc }), CrmError: class extends Error {
        constructor(message: string, public status = 400) { super(message); }
    } }));
vi.mock("@/lib/google-calendar/api", () => ({ fetchMemberBusy: m.busy }));
import { sessionAvailability, sessionCalendarWriteAccess, bookSession, publicSessionType } from "./scheduling-server";
import type { Appointment, SessionType } from "./scheduling-types";
const t: SessionType = { id: "00000000-0000-4000-8000-000000000001", version: 1, name: "Planning", slug: "planning", description: "",confirmation_instructions:"",owner_id: "00000000-0000-4000-8000-000000000002", duration_minutes: 30, timezone: "America/New_York", availability: [{ day: 1, start: "09:00", end: "12:00" }], notice_minutes: 0, horizon_days: 90, booking_horizon_months: null, slot_interval_minutes:15, use_session_as_project_date:false, buffer_minutes: 0,buffer_before_minutes:null,buffer_after_minutes:null, location: "Phone", published: true };
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
    vi.stubEnv("VERCEL_ENV", "production");
    m.scope = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
    m.blocks = [];
    m.external = [];
    m.busy.mockImplementation(async () => ({ source: "own", busy: m.external }));
    m.rpc.mockResolvedValue({ data: { ok: true, id: "booked", token: "a".repeat(64) }, error: null });
    m.from.mockImplementation((table: string) => {
        const result = () => ({ data: table === "team_calendar_connections" ? { scope: m.scope, is_active: true, account_email: "host@example.test" } : table === "schedule_blocks" ? m.blocks : table === "orders" ? [] : table === "crm_session_types" ? t : null, error: null });
        const chain: any = {};
        for (const method of ["select", "eq", "lt", "gt", "gte", "lte", "not", "limit"])
            chain[method] = () => chain;
        chain.maybeSingle = async () => result();
        chain.then = (yes: any, no: any) => Promise.resolve(result()).then(yes, no);
        return chain;
    });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("excludes only the appointment’s exact primary Google hold when rescheduling", async () => {
    const a = { id: "appointment", schedule_block_id: "self" } as Appointment, eventId = createHash("sha256").update(`crm-session/${a.id}`).digest("hex");
    m.blocks = [{ id: "self", starts_at: "2026-10-19T13:00:00Z", ends_at: "2026-10-19T13:30:00Z" }];
    m.external = [{ eventId, calendarId: "host@example.test", start: "2026-10-19T13:00:00Z", end: "2026-10-19T13:30:00Z" }];
    expect((await sessionAvailability(t, "2026-10-19", a)).slots).toContain("2026-10-19T13:15:00.000Z");
    m.external.push({ eventId: "unrelated", calendarId: "host@example.test", start: "2026-10-19T13:00:00Z", end: "2026-10-19T13:30:00Z" });
    expect((await sessionAvailability(t, "2026-10-19", a)).slots).not.toContain("2026-10-19T13:15:00.000Z");
    m.external = [{ eventId, calendarId: "another-calendar@example.test", start: "2026-10-19T13:00:00Z", end: "2026-10-19T13:30:00Z" }];
    expect((await sessionAvailability(t, "2026-10-19", a)).slots).not.toContain("2026-10-19T13:15:00.000Z");
});
it("requires event write scopes even when Google read availability works", async () => { m.scope = "https://www.googleapis.com/auth/calendar.readonly"; await expect(sessionCalendarWriteAccess(t.owner_id)).rejects.toThrow("permission to create events"); });
it("does not call the calendar for dates outside configured hours or horizon", async () => { expect((await sessionAvailability(t, "2026-10-18")).slots).toEqual([]); expect(m.busy).not.toHaveBeenCalled(); expect(m.from).not.toHaveBeenCalled(); });
it("fails closed on unverifiable calendars instead of offering empty-calendar slots", async () => { m.busy.mockResolvedValue({ source: "none", busy: [] }); await expect(sessionAvailability(t, "2026-10-19")).rejects.toThrow("connected"); });
it("rechecks live availability immediately before the guarded booking commit", async () => {
    await bookSession("planning", { id: "00000000-0000-4000-8000-000000000003", starts_at: "2026-10-19T13:15:00Z", full_name: "Test Client", email: "client@example.test", email_consent: false,phone:"8435550100" });
    expect(m.busy).toHaveBeenCalledOnce();
    expect(m.rpc).toHaveBeenCalledWith("crm_session_commit", expect.objectContaining({ p_type_version: 1, p_calendar_checked_at: "2026-10-17T12:00:00.000Z", p_data: expect.objectContaining({ email_consent: false, manage_token: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
});
it("blocks preview booking before touching data or providers", async () => { vi.stubEnv("VERCEL_ENV", "preview"); await expect(bookSession("planning", {})).rejects.toThrow("production"); expect(m.from).not.toHaveBeenCalled(); expect(m.busy).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled(); });
it("never serializes internal host, availability or version into the public type", () => { expect(Object.keys(publicSessionType(t)).sort()).toEqual(["description", "duration_minutes", "location", "name", "slug", "timezone"]); });
it("requires a callable phone number for phone sessions before calendar or mutation work",async()=>{
 await expect(bookSession("planning",{id:"00000000-0000-4000-8000-000000000003",starts_at:"2026-10-19T13:15:00Z",full_name:"Test Client",email:"client@example.test",email_consent:false,phone:"123"})).rejects.toThrow("phone number");expect(m.busy).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
