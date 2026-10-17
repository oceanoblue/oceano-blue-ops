import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ limit: vi.fn(), type: vi.fn(), availability: vi.fn(), book: vi.fn(), appointment: vi.fn(), change: vi.fn(), guard: vi.fn(), checkout: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/security/crm-public-rate-limit", () => ({ enforceCrmPublicRateLimit: mock.limit }));
vi.mock("@/lib/crm/scheduling-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crm/scheduling-server")>("@/lib/crm/scheduling-server");
  return { ...actual, readSessionType: mock.type, sessionAvailability: mock.availability, bookSession: mock.book, appointmentByToken: mock.appointment, changeSession: mock.change, schedulingProduction: mock.guard };
});
vi.mock("@/lib/crm/billing-server", () => ({ projectCheckout: mock.checkout }));
vi.mock("@/lib/crm/scheduling-mail", () => ({ runSessionNotifications: mock.run }));
import { POST as book, GET as slots } from "@/app/api/crm/scheduling/public/[slug]/route";
import { POST as manage, GET as details } from "@/app/api/crm/scheduling/manage/[token]/route";
import { POST as checkout } from "@/app/api/crm/billing/checkout/[token]/route";
import { GET as worker } from "@/app/api/crm/scheduling/notifications/route";
import { CrmError } from "@/lib/crm/server";
const token = "a".repeat(64), tokenContext = { params: Promise.resolve({ token }) }, slugContext = { params: Promise.resolve({ slug: "consultation" }) };
const req = (url = "https://ops.example/api", origin = "https://ops.example", body: unknown = {}) => new Request(url, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const appointment = { id: "appointment", session_type_id: null, title: "Planning call", location: "Online", timezone: "America/New_York", full_name: "Client", email: "private@example.test", phone: "private", notes: "private", client_id: "private-client", project_id: "private-project", owner_id: "private-owner", manage_token: token, starts_at: "2027-01-01T15:00:00Z", ends_at: "2027-01-01T15:30:00Z", status: "confirmed", version: 1 };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("VERCEL_ENV", "production");
  mock.limit.mockResolvedValue(null); mock.type.mockResolvedValue({ name: "Consultation", slug: "consultation", description: "Meet", duration_minutes: 30, timezone: "America/New_York", location: "Online", owner_id: "private-owner", availability: [] }); mock.availability.mockResolvedValue({ slots: [] }); mock.appointment.mockResolvedValue(appointment); mock.book.mockResolvedValue({ ok: true }); mock.change.mockResolvedValue({ ok: true }); mock.checkout.mockResolvedValue({ url: "https://checkout.stripe.com/example" }); mock.guard.mockImplementation(() => { if (process.env.VERCEL_ENV !== "production") throw new CrmError("Use production.", 403); });
});
afterEach(() => vi.unstubAllEnvs());
it("rejects cross-origin booking, management and checkout before any protected work", async () => {
  expect((await book(req(undefined, "https://evil.example"), slugContext)).status).toBe(403);
  expect((await manage(req(undefined, "https://evil.example"), tokenContext)).status).toBe(403);
  expect((await checkout(req(undefined, "https://evil.example"), tokenContext)).status).toBe(403);
  expect(mock.limit).not.toHaveBeenCalled(); expect(mock.book).not.toHaveBeenCalled(); expect(mock.change).not.toHaveBeenCalled(); expect(mock.checkout).not.toHaveBeenCalled();
});
it("blocks preview booking, management and checkout before limiter or provider work", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await book(req(), slugContext)).status).toBe(403); expect((await manage(req(), tokenContext)).status).toBe(403); expect((await checkout(req(), tokenContext)).status).toBe(403);
  expect(mock.limit).not.toHaveBeenCalled(); expect(mock.appointment).not.toHaveBeenCalled(); expect(mock.checkout).not.toHaveBeenCalled();
});
it("does not access appointments, calendars or payment providers when durable limits fail closed", async () => {
  mock.limit.mockImplementation(async () => Response.json({ error: "Unavailable" }, { status: 503 }));
  expect((await slots(new Request("https://ops.example/api?date=2027-01-01"), slugContext)).status).toBe(503);
  expect((await book(req(), slugContext)).status).toBe(503);
  expect((await details(new Request("https://ops.example/api"), tokenContext)).status).toBe(503);
  expect((await manage(req(), tokenContext)).status).toBe(503);
  expect((await checkout(req(), tokenContext)).status).toBe(503);
  for (const fn of [mock.type, mock.availability, mock.appointment, mock.book, mock.change, mock.checkout]) expect(fn).not.toHaveBeenCalled();
});
it("bounds booking and management JSON bodies before commands", async () => {
  const large = (size: number) => new Request("https://ops.example/api", { method: "POST", headers: { origin: "https://ops.example", "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(size) }) });
  expect((await book(large(10001), slugContext)).status).toBe(413);
  expect((await manage(large(3001), tokenContext)).status).toBe(413);
  expect(mock.book).not.toHaveBeenCalled(); expect(mock.change).not.toHaveBeenCalled();
});
it("returns only the appointment fields needed by its private management page", async () => {
  const r = await details(new Request("https://ops.example/api"), tokenContext);
  expect(r.status).toBe(200); const data = await r.json();
  for (const key of ["email", "phone", "notes", "client_id", "project_id", "owner_id", "manage_token"]) expect(data.appointment).not.toHaveProperty(key);
  expect(data.canReschedule).toBe(false); expect(r.headers.get("Cache-Control")).toBe("private, no-store"); expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
});
it("projects public session fields without leaking the host or internal availability", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crm/scheduling-server")>("@/lib/crm/scheduling-server");
  const result = actual.publicSessionType(await mock.type());
  expect(Object.keys(result).sort()).toEqual(["name", "slug", "description", "duration_minutes", "timezone", "location"].sort());
});
it("limits valid payment preparations without requiring an office session", async () => {
  const r = await checkout(req(), tokenContext);
  expect(r.status).toBe(200); expect(mock.limit).toHaveBeenCalledWith(expect.any(Request), "project-checkout", 20, 3600); expect(mock.checkout).toHaveBeenCalledWith(token, expect.any(Request));
});
it("requires the worker Bearer secret independently of public routing", async () => {
  vi.stubEnv("CRON_SECRET", "worker-test-secret");
  expect((await worker(new Request("https://ops.example/api/crm/scheduling/notifications"))).status).toBe(401); expect(mock.run).not.toHaveBeenCalled();
  mock.run.mockResolvedValue({ processed: 0 });
  expect((await worker(new Request("https://ops.example/api/crm/scheduling/notifications", { headers: { authorization: "Bearer worker-test-secret" } }))).status).toBe(200); expect(mock.run).toHaveBeenCalledTimes(1);
});
