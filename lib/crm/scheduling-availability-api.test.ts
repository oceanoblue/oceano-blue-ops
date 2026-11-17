import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), type: vi.fn(), appointment: vi.fn(), month: vi.fn(), day: vi.fn(), limit: vi.fn() }));
vi.mock("./server", async () => ({ ...await vi.importActual<typeof import("./server")>("./server"), crmDb: () => ({ from: mock.from }) }));
vi.mock("./scheduling-server", async () => ({
    ...await vi.importActual<typeof import("./scheduling-server")>("./scheduling-server"),
    readSessionType: mock.type, appointmentByToken: mock.appointment,
    sessionMonthAvailability: mock.month, sessionAvailability: mock.day,
}));
vi.mock("@/lib/security/crm-public-rate-limit", () => ({ enforceCrmPublicRateLimit: mock.limit }));
import { GET as publicGet } from "@/app/api/crm/scheduling/public/[slug]/route";
import { GET as managedGet } from "@/app/api/crm/scheduling/manage/[token]/route";
import { CrmError } from "./server";
const slug = "full-day-filming", token = "a".repeat(64);
const type = { id: "type", owner_id: "host", published: true, timezone: "America/New_York" };
const appointment = { id: "appointment", session_type_id: "type", owner_id: "host", status: "confirmed", import_state: "native", schedule_block_id: "private-block" };
const summary = { month: "2026-11", timezone: type.timezone, days: [{ date: "2026-11-19", slot_count: 1 }], min_date: "2026-11-17", max_date: "2027-02-15" };
const request = (query: string, managed = false) => new Request(`https://app.oceanoblue.net/api/crm/scheduling/${managed ? `manage/${token}` : `public/${slug}`}${query}`);
beforeEach(() => {
    vi.resetAllMocks();
    mock.limit.mockResolvedValue(null);
    mock.type.mockResolvedValue(type);
    mock.appointment.mockResolvedValue(appointment);
    mock.month.mockResolvedValue(summary);
    mock.day.mockResolvedValue({ slots: ["2026-11-19T14:00:00.000Z"], checkedAt: "2026-11-17T12:00:00.000Z" });
    mock.from.mockImplementation(() => {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: type, error: null }) };
        return chain;
    });
});
it("returns a no-store month summary through the existing public availability route", async () => {
    const result = await publicGet(request("?month=2026-11"), { params: Promise.resolve({ slug }) });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual(summary);
    expect(mock.month).toHaveBeenCalledExactlyOnceWith(type, "2026-11");
    expect(mock.day).not.toHaveBeenCalled();
});
it("rejects invalid or ambiguous month requests without fetching calendar availability", async () => {
    for (const query of ["?month=", "?month=2026-13", "?month=2026-1", "?month=2026-11&date=2026-11-19"]) {
        expect((await publicGet(request(query), { params: Promise.resolve({ slug }) })).status).toBe(400);
        expect((await managedGet(request(query, true), { params: Promise.resolve({ token }) })).status).toBe(400);
    }
    expect(mock.month).not.toHaveBeenCalled();
    expect(mock.day).not.toHaveBeenCalled();
});
it("keeps the per-date endpoint available for fresh time selection", async () => {
    const result = await publicGet(request("?date=2026-11-19"), { params: Promise.resolve({ slug }) });
    expect(await result.json()).toEqual({ slots: ["2026-11-19T14:00:00.000Z"], timezone: type.timezone });
    expect(mock.day).toHaveBeenCalledExactlyOnceWith(type, "2026-11-19");
    expect(mock.month).not.toHaveBeenCalled();
});
it("passes the authenticated appointment to month availability and keeps its response private", async () => {
    const result = await managedGet(request("?month=2026-11", true), { params: Promise.resolve({ token }) });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await result.json()).toEqual(summary);
    expect(mock.appointment).toHaveBeenCalledExactlyOnceWith(token);
    expect(mock.month).toHaveBeenCalledExactlyOnceWith(type, "2026-11", appointment);
});
it("keeps cancelled, unpaid, imported and reassigned sessions out of rescheduling month availability", async () => {
    for (const changes of [{ status: "cancelled" }, { status: "pending_payment" }, { import_state: "reference" }, { owner_id: "other-host" }]) {
        mock.appointment.mockResolvedValue({ ...appointment, ...changes });
        const result = await managedGet(request("?month=2026-11", true), { params: Promise.resolve({ token }) });
        expect(result.status).toBeGreaterThanOrEqual(400);
    }
    expect(mock.month).not.toHaveBeenCalled();
});
it("does not serve month availability when the session type is missing or unpublished", async () => {
    for (const data of [null, { ...type, published: false }]) {
        mock.from.mockImplementation(() => {
            const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data, error: null }) };
            return chain;
        });
        expect((await managedGet(request("?month=2026-11", true), { params: Promise.resolve({ token }) })).status).toBe(400);
    }
    expect(mock.month).not.toHaveBeenCalled();
});
it("preserves rate limits, unavailable public links and provider errors", async () => {
    mock.limit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await publicGet(request("?month=2026-11"), { params: Promise.resolve({ slug }) })).status).toBe(429);
    expect(mock.type).not.toHaveBeenCalled();
    mock.limit.mockResolvedValue(null);
    mock.type.mockRejectedValueOnce(new CrmError("This scheduling link is unavailable.", 404));
    expect((await publicGet(request("?month=2026-11"), { params: Promise.resolve({ slug }) })).status).toBe(404);
    expect(mock.month).not.toHaveBeenCalled();
    mock.month.mockRejectedValueOnce(new CrmError("Calendar availability could not be verified.", 503));
    expect((await publicGet(request("?month=2026-11"), { params: Promise.resolve({ slug }) })).status).toBe(503);
});
