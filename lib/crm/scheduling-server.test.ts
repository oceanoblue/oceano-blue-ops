import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), busy: vi.fn(), scope: "", blocks: [] as any[], orders: [] as any[], blockCount: null as number | null, orderCount: null as number | null, orgBuffer: 30, settingsError: null as object | null, external: [] as any[] }));
vi.mock("./server", () => ({ crmDb: () => ({ from: m.from, rpc: m.rpc }), CrmError: class extends Error {
        constructor(message: string, public status = 400) { super(message); }
    } }));
vi.mock("@/lib/google-calendar/api", () => ({ fetchMemberBusy: m.busy }));
import { sessionAvailability, sessionMonthAvailability, sessionCalendarWriteAccess, bookSession, publicSessionType, schedulingRead } from "./scheduling-server";
import { appointmentTimeLabel } from "./appointment-time";
import type { Appointment, SessionType } from "./scheduling-types";
const t: SessionType = { category: "general", price_cents: 0, id: "00000000-0000-4000-8000-000000000001", version: 1, name: "Planning", slug: "planning", description: "",confirmation_instructions:"",owner_id: "00000000-0000-4000-8000-000000000002", duration_minutes: 30, timezone: "America/New_York", availability: [{ day: 1, start: "09:00", end: "12:00" }], notice_minutes: 0, horizon_days: 90, booking_horizon_months: null, slot_interval_minutes:15, use_session_as_project_date:false, buffer_minutes: 0,buffer_before_minutes:null,buffer_after_minutes:null, location: "Phone", published: true };
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
    vi.stubEnv("VERCEL_ENV", "production");
    m.scope = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
    m.blocks = [];
    m.orders = [];
    m.blockCount = null;
    m.orderCount = null;
    m.orgBuffer = 30;
    m.settingsError = null;
    m.external = [];
    m.busy.mockImplementation(async () => ({ source: "own", busy: m.external }));
    m.rpc.mockResolvedValue({ data: { ok: true, id: "booked", token: "a".repeat(64) }, error: null });
    m.from.mockImplementation((table: string) => {
        const result = () => ({ data: table === "team_calendar_connections" ? { scope: m.scope, is_active: true, account_email: "host@example.test" } : table === "schedule_blocks" ? m.blocks : table === "orders" ? m.orders : table === "business_settings" ? { buffer_minutes: m.orgBuffer } : table === "crm_session_types" ? t : null, error: table === "business_settings" ? m.settingsError : null, count: table === "schedule_blocks" ? m.blockCount ?? m.blocks.length : table === "orders" ? m.orderCount ?? m.orders.length : null });
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
it("never serializes internal host, availability or version into the public type", () => { expect(Object.keys(publicSessionType(t)).sort()).toEqual(["category", "description", "duration_minutes", "location", "name", "price_cents", "slug", "timezone"]); });
it("preserves source date holds through the office read without exposing manage tokens", async () => {
    const hold = { starts_at: "2027-01-07T05:00:00Z", ends_at: "2027-01-08T05:00:00Z", timezone: "America/New_York", source_evidence: { all_day: true }, manage_token: "private" };
    m.from.mockImplementation((table: string) => {
        let columns: string[] = [];
        const chain: any = {};
        chain.select = (projection: string) => { columns = projection.split(","); return chain; };
        for (const method of ["gte", "order", "eq", "in", "limit"]) chain[method] = () => chain;
        chain.then = (yes: any, no: any) => Promise.resolve({ data: table === "crm_appointments" ? [Object.fromEntries(Object.entries(hold).filter(([key]) => columns.includes(key)))] : [], error: null }).then(yes, no);
        return chain;
    });
    const data = await schedulingRead();
    expect(appointmentTimeLabel(data.appointments[0])).toBe("Thu, Jan 7, 2027 · All-day hold; confirm coverage times");
    expect(data.appointments[0]).not.toHaveProperty("manage_token");
});
it("requires a callable phone number for phone sessions before calendar or mutation work",async()=>{
 await expect(bookSession("planning",{id:"00000000-0000-4000-8000-000000000003",starts_at:"2026-10-19T13:15:00Z",full_name:"Test Client",email:"client@example.test",email_consent:false,phone:"123"})).rejects.toThrow("phone number");expect(m.busy).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it("adds the organization shoot travel buffer to the session's before buffer without widening CRM-only holds", async () => {
    m.orders = [{ scheduled_at: "2026-10-19T13:00:00Z", duration_minutes: 60, photographer_id: t.owner_id }];
    let slots = (await sessionAvailability(t, "2026-10-19")).slots;
    expect(slots).not.toContain("2026-10-19T14:00:00.000Z");
    expect(slots).not.toContain("2026-10-19T14:15:00.000Z");
    expect(slots).toContain("2026-10-19T14:30:00.000Z");
    slots = (await sessionAvailability({ ...t, buffer_before_minutes: 15 }, "2026-10-19")).slots;
    expect(slots).not.toContain("2026-10-19T14:30:00.000Z");
    expect(slots).toContain("2026-10-19T14:45:00.000Z");
    m.orders = [];
    m.orgBuffer = 60;
    m.blocks = [{ id: "another-session", starts_at: "2026-10-19T14:00:00Z", ends_at: "2026-10-19T14:30:00Z" }];
    expect((await sessionAvailability(t, "2026-10-19")).slots).toContain("2026-10-19T14:30:00.000Z");
});
it("uses the actual video visit and the session's after buffer before a shoot", async () => {
    m.orders = [{ scheduled_at: "2026-10-19T13:00:00Z", duration_minutes: 120, photographer_id: "other-host", videographer_id: t.owner_id, videographer_start_offset_minutes: 120, videographer_duration_minutes: 60 }];
    const slots = (await sessionAvailability({ ...t, buffer_after_minutes: 15 }, "2026-10-19")).slots;
    expect(slots).toContain("2026-10-19T13:45:00.000Z");
    expect(slots).not.toContain("2026-10-19T14:00:00.000Z");
});
it("fails closed before commit when the existing organization buffer cannot be read", async () => {
    m.settingsError = { message: "unavailable" };
    await expect(bookSession("planning", { id: "00000000-0000-4000-8000-000000000003", starts_at: "2026-10-19T13:15:00Z", full_name: "Test Client", email: "client@example.test", email_consent: false, phone: "8435550100" })).rejects.toThrow("could not be verified");
    expect(m.rpc).not.toHaveBeenCalled();
});
it("checks one shared calendar range for a whole month and marks full-day conflicts unavailable", async () => {
    const fullDay = { ...t, duration_minutes: 480, notice_minutes: 2880, availability: [1, 2, 3, 4, 5].map(day => ({ day, start: "09:00", end: "17:00" })) };
    m.external = [{ start: "2026-10-20T16:00:00Z", end: "2026-10-20T17:00:00Z" }];
    m.blocks = [{ id: "existing-session", starts_at: "2026-10-21T13:00:00Z", ends_at: "2026-10-21T14:00:00Z" }];
    m.orders = [
        { scheduled_at: "2026-10-22T13:00:00Z", duration_minutes: 60, photographer_id: "someone-else", videographer_id: t.owner_id, videographer_start_offset_minutes: 120, videographer_duration_minutes: 60 },
        { scheduled_at: "2026-10-23T12:00:00Z", duration_minutes: 60, photographer_id: t.owner_id },
    ];
    const month = await sessionMonthAvailability(fullDay, "2026-10");
    expect(month.days).toHaveLength(31);
    expect(Object.keys(month).sort()).toEqual(["days", "max_date", "min_date", "month", "timezone"]);
    expect(month.days.filter(day => day.slot_count > 0)).toEqual([19, 26, 27, 28, 29, 30].map(day => ({ date: `2026-10-${day}`, slot_count: 1 })));
    expect(m.busy).toHaveBeenCalledExactlyOnceWith(t.owner_id, "2026-10-18T00:00:00.000Z", "2026-11-01T00:00:00.000Z");
    for (const day of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26"]) {
        expect(month.days.find(d => d.date === day)?.slot_count).toBe((await sessionAvailability(fullDay, day)).slots.length);
    }
});
it("applies notice and inclusive horizon to every date in the month", async () => {
    const fullDay = { ...t, duration_minutes: 480, notice_minutes: 4320, horizon_days: 5, availability: [1, 2, 3, 4, 5].map(day => ({ day, start: "09:00", end: "17:00" })) };
    const month = await sessionMonthAvailability(fullDay, "2026-10");
    expect(month.min_date).toBe("2026-10-17");
    expect(month.max_date).toBe("2026-10-22");
    expect(month.days.filter(day => day.slot_count > 0).map(day => day.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
});
it("keeps month summaries aligned with daily DST slots and the host's current date", async () => {
    vi.setSystemTime(new Date("2027-03-01T02:00:00Z"));
    const type = { ...t, booking_horizon_months: 1, availability: [{ day: 0, start: "01:00", end: "04:00" }] };
    const month = await sessionMonthAvailability(type, "2027-03");
    expect(month.min_date).toBe("2027-02-28");
    expect(month.max_date).toBe("2027-03-28");
    expect(month.days.find(day => day.date === "2027-03-14")?.slot_count).toBe(7);
    expect(month.days.find(day => day.date === "2027-03-14")?.slot_count).toBe((await sessionAvailability(type, "2027-03-14")).slots.length);
});
it("rejects invalid months and avoids providers for months without any candidate dates", async () => {
    for (const month of ["2026-13", "2026-00", "2026-1", "2026-10-19", ""]) await expect(sessionMonthAvailability(t, month)).rejects.toThrow("valid month");
    const month = await sessionMonthAvailability(t, "2027-12");
    expect(month.days).toHaveLength(31);
    expect(month.days.every(day => day.slot_count === 0)).toBe(true);
    expect(m.busy).not.toHaveBeenCalled();
    expect(m.from).not.toHaveBeenCalled();
});
it("fails closed on provider failure or truncated month conflicts", async () => {
    m.busy.mockResolvedValue({ source: "none", busy: [] });
    await expect(sessionMonthAvailability(t, "2026-10")).rejects.toThrow("connected");
    m.busy.mockResolvedValue({ source: "own", busy: [] });
    m.orderCount = 1;
    await expect(sessionMonthAvailability(t, "2026-10")).rejects.toThrow("could not be verified");
    m.orderCount = null;
    m.blockCount = 1;
    await expect(sessionMonthAvailability(t, "2026-10")).rejects.toThrow("could not be verified");
    m.blockCount = null;
    m.settingsError = { message: "unavailable" };
    await expect(sessionMonthAvailability(t, "2026-10")).rejects.toThrow("could not be verified");
});
it("excludes only the rescheduled appointment's own block and exact primary event in month summaries", async () => {
    const a = { id: "appointment", schedule_block_id: "self" } as Appointment;
    const eventId = createHash("sha256").update(`crm-session/${a.id}`).digest("hex");
    const fullDay = { ...t, duration_minutes: 480, availability: [{ day: 1, start: "09:00", end: "17:00" }] };
    m.blocks = [{ id: "self", starts_at: "2026-10-19T13:00:00Z", ends_at: "2026-10-19T21:00:00Z" }];
    m.external = [{ eventId, calendarId: "host@example.test", start: "2026-10-19T13:00:00Z", end: "2026-10-19T21:00:00Z" }];
    expect((await sessionMonthAvailability(fullDay, "2026-10", a)).days.find(day => day.date === "2026-10-19")?.slot_count).toBe(1);
    m.external.push({ eventId: "another-event", calendarId: "host@example.test", start: "2026-10-19T15:00:00Z", end: "2026-10-19T16:00:00Z" });
    expect((await sessionMonthAvailability(fullDay, "2026-10", a)).days.find(day => day.date === "2026-10-19")?.slot_count).toBe(0);
});
