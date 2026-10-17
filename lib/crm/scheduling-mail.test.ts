import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), send: vi.fn(), configured: vi.fn(), sync: vi.fn(), saved: [] as Record<string, unknown>[], appointment: null as any, job: null as any }));
vi.mock("./server", () => ({ crmDb: () => ({ rpc: m.rpc, from: m.from }) }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: m.send, isEmailConfigured: m.configured }));
vi.mock("./scheduling-calendar", () => ({ syncSessionCalendar: m.sync }));
import { runSessionNotifications, sessionEmail } from "./scheduling-mail";
beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.clearAllMocks();
    m.saved = [];
    m.appointment = { id: "a", owner_id: "host", full_name: "<Test Client>", email: "client@example.test", phone: "123", title: "Planning", location: "Phone", timezone: "America/New_York", starts_at: "2099-10-20T14:00:00Z", ends_at: "2099-10-20T14:30:00Z", status: "confirmed", version: 1, email_consent: true, source_system: "ops", import_state: "native", manage_token: "a".repeat(64) };
    m.job = { id: "job", appointment_id: "a", appointment_version: 1, audience: "client", kind: "confirmation", lease_token: "lease" };
    m.rpc.mockImplementation(async () => ({ data: [m.job], error: null }));
    m.configured.mockReturnValue(true);
    m.send.mockResolvedValue({ status: "sent", id: "provider" });
    m.sync.mockResolvedValue(undefined);
    m.from.mockImplementation((table: string) => {
        let update: Record<string, unknown> | null = null;
        const chain: any = { select: () => chain, eq: () => chain, update: (v: Record<string, unknown>) => { update = v; return chain; }, maybeSingle: async () => {
                if (update) {
                    m.saved.push(update);
                    return { data: { id: "job" }, error: null };
                }
                return { data: table === "team_members" ? { email: "host@example.test", is_active: true } : m.appointment, error: null };
            } };
        return chain;
    });
});
afterEach(() => vi.unstubAllEnvs());
it("never claims jobs or invokes providers from previews", async () => { vi.stubEnv("VERCEL_ENV", "preview"); expect((await runSessionNotifications()).processed).toBe(0); expect(m.rpc).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled(); });
it("sends client confirmation with a stable provider dedupe key and private management link", async () => {
    await runSessionNotifications();
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: "client@example.test", idempotencyKey: "crm-session/job", html: expect.stringContaining(`/meet/manage/${"a".repeat(64)}`) }));
    expect(m.saved[0]).toMatchObject({ status: "accepted", provider_id: "provider" });
});
it("sends host reminders independently of client opt-in, to the office address and agenda", async () => {
    m.job = { ...m.job, audience: "office", kind: "reminder_1h" };
    m.appointment.email_consent = false;
    await runSessionNotifications();
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: "host@example.test", subject: expect.stringContaining("one hour"), html: expect.stringContaining("/dashboard/crm/scheduling") }));
    expect(m.send.mock.calls[0][0].html).not.toContain("/meet/manage/");
});
it("suppresses stale or unconsented client messages without provider calls", async () => {
    m.appointment.email_consent = false;
    await runSessionNotifications();
    expect(m.send).not.toHaveBeenCalled();
    expect(m.saved[0].status).toBe("cancelled");
    m.appointment.email_consent = true;
    m.appointment.version = 2;
    await runSessionNotifications();
    expect(m.send).not.toHaveBeenCalled();
});
it("mirrors native calendar holds even without client email consent", async () => { m.job.kind = "calendar"; m.job.audience = "office"; m.appointment.email_consent = false; await runSessionNotifications(); expect(m.sync).toHaveBeenCalledOnce(); expect(m.send).not.toHaveBeenCalled(); expect(m.saved[0].status).toBe("accepted"); });
it("never mirrors imported source appointments", async () => { m.job.kind = "calendar"; m.appointment.source_system = "honeybook"; m.appointment.import_state = "reference"; await runSessionNotifications(); expect(m.sync).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); expect(m.saved[0].status).toBe("cancelled"); });
it("retains ambiguous email/calendar outcomes for office review", async () => {
    m.send.mockResolvedValue({ status: "failed", error: "timeout" });
    await runSessionNotifications();
    expect(m.saved[0].status).toBe("needs_review");
    m.job.kind = "calendar";
    m.sync.mockRejectedValue(new Error("Reconnect calendar"));
    await runSessionNotifications();
    expect(m.saved[1]).toMatchObject({ status: "needs_review", last_error: "Reconnect calendar" });
});
it("escapes client data in email HTML and keeps cancellation subjects accurate", () => {
    const email = sessionEmail(m.appointment, "cancelled", "https://app.oceanoblue.net");
    expect(email.html).toContain("&lt;Test Client&gt;");
    expect(email.html).not.toContain("<Test Client>");
    expect(email.subject).toContain("Session cancelled");
});
