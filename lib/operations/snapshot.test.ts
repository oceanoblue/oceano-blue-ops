import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("@/lib/google-calendar/api", () => ({ getAccessToken: vi.fn() }));
import { loadSnapshot } from "./snapshot";
const now = new Date("2026-09-24T11:00:00Z");
const job = {
  id: "job",
  title: "Linked job",
  status: "media_received",
  due_date: "2026-09-24",
  scheduled_at: null,
  updated_at: now.toISOString(),
  priority: "normal",
  assigned_to: null,
  next_action: null,
  clients: { full_name: "Client" },
};
const order = {
  id: "order",
  order_number: 12,
  status: "uploaded",
  job_id: "job",
  scheduled_at: "2026-09-24T14:00:00Z",
  duration_minutes: 90,
  updated_at: now.toISOString(),
  rush: false,
  editor_id: null,
  gcal_event_id: null,
  listings: { address_line1: "Sample property" },
  clients: { full_name: "Client" },
};
let results: Record<string, { data: unknown; error: unknown; count?: number }>;
beforeEach(() => {
  results = {
    orders: { data: [order], error: null },
    jobs: { data: [job], error: null },
    editor_assignments: { data: [], error: null },
    external_edit_batches: { data: [], error: null },
    team_members: {
      data: [{ id: "editor", full_name: "Staff editor" }],
      error: null,
    },
    team_calendar_connections: { data: null, error: null },
    tool_runs: { data: null, error: null, count: 0 },
  };
});
function client() {
  return {
    from: (name: string) => {
      const builder: any = {
        then: (resolve: any) => Promise.resolve(results[name]).then(resolve),
      };
      for (const method of [
        "select",
        "is",
        "not",
        "order",
        "limit",
        "neq",
        "eq",
        "maybeSingle",
        "gte",
      ])
        builder[method] = () => builder;
      return builder;
    },
  } as SupabaseClient<Database>;
}
it("deduplicates bridged orders/jobs and leaves disconnected calendars unverified", async () => {
  const s = await loadSnapshot(client(), "user", "America/New_York", now);
  expect(s.items).toHaveLength(1);
  expect(s.items[0]).toMatchObject({
    id: "order",
    lane: "prepare",
    due: "2026-09-24",
    overdue: false,
    route: "unassigned",
  });
  expect(s.events).toHaveLength(1);
  expect(s.calendar.status).toBe("disconnected");
});
it("recognizes internal assigned work and draft handoffs separately", async () => {
  results.editor_assignments.data = [
    {
      job_id: "job",
      status: "accepted",
      editor_type: "internal",
      editor_user_id: "editor",
      editor_name: null,
      due_date: "2026-09-23",
    },
  ];
  const s = await loadSnapshot(client(), "user", "America/New_York", now);
  expect(s.items[0]).toMatchObject({
    lane: "editing",
    editor: "Staff editor",
    route: "internal",
    overdue: true,
  });
});
it("recognizes prepared outsourced exports and returned work", async () => {
  results.external_edit_batches.data = [
    {
      order_id: "order",
      status: "export_ready",
      provider: "Outsource studio",
      photo_count: 25,
    },
  ];
  expect(
    (await loadSnapshot(client(), "user", "America/New_York", now)).items[0],
  ).toMatchObject({
    lane: "prepare",
    route: "external",
    editor: "Outsource studio",
    blockers: [],
  });
  results.external_edit_batches.data = [
    { order_id: "order", status: "returned", provider: "Outsource studio" },
  ];
  expect(
    (await loadSnapshot(client(), "user", "America/New_York", now)).items[0]
      .lane,
  ).toBe("review");
});
it("fails explicitly instead of rendering missing database rows as empty queues", async () => {
  results.jobs = { data: null, error: { message: "permission denied" } };
  await expect(
    loadSnapshot(client(), "user", "America/New_York", now),
  ).rejects.toThrow("Production data could not be loaded");
});
