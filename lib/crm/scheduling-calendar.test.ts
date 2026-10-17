import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
const m = vi.hoisted(() => ({ token: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/google-calendar/api", () => ({ getAccessToken: m.token }));
import { syncSessionCalendar } from "./scheduling-calendar";
import type { Appointment } from "./scheduling-types";
const a = { id: "test-appointment", owner_id: "host", title: "Planning", full_name: "Test Client", email: "client@example.test", phone: "", location: "Phone", timezone: "America/New_York", starts_at: "2027-01-01T14:00:00Z", ends_at: "2027-01-01T14:30:00Z", status: "confirmed", version: 1, source_system: "ops", import_state: "native" } as Appointment;
beforeEach(() => { vi.clearAllMocks(); m.token.mockResolvedValue("access"); m.fetch.mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", m.fetch); });
afterEach(() => vi.unstubAllGlobals());
it("uses deterministic provider IDs and creates a busy event without invitations", async () => {
    await syncSessionCalendar(a);
    const [url, options] = m.fetch.mock.calls[0];
    expect(url).toContain("sendUpdates=none");
    const body = JSON.parse(options.body);
    expect(body.id).toBe(createHash("sha256").update(`crm-session/${a.id}`).digest("hex"));
    expect(body.attendees).toEqual([]);
    expect(body.transparency).toBe("opaque");
    expect(body.extendedProperties.private.ops_session_id).toBe(a.id);
});
it("converges on the existing hold following an interrupted create", async () => {
    m.fetch.mockResolvedValueOnce(new Response("{}", { status: 409 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await syncSessionCalendar(a);
    expect(m.fetch.mock.calls[1][1].method).toBe("PATCH");
    expect(m.fetch.mock.calls[1][0]).toContain("sendUpdates=none");
});
it("removes a cancelled hold and treats a missing event as already removed", async () => {
    m.fetch.mockResolvedValue(new Response("{}", { status: 410 }));
    await syncSessionCalendar({ ...a, status: "cancelled" });
    expect(m.fetch.mock.calls[0][1].method).toBe("DELETE");
});
it("fails closed on missing calendar credentials or failed provider writes", async () => {
    m.token.mockResolvedValueOnce(null);
    await expect(syncSessionCalendar(a)).rejects.toThrow("Reconnect");
    expect(m.fetch).not.toHaveBeenCalled();
    m.fetch.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    await expect(syncSessionCalendar(a)).rejects.toThrow("could not be confirmed");
});
it("never writes source imports to Google", async () => { await syncSessionCalendar({ ...a, source_system: "honeybook", import_state: "reference" }); expect(m.token).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled(); });
