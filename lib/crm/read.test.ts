import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => mocks,
  createClient: vi.fn(),
}));
import { crmRead } from "./server";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation(() => {
    const chain = {
      select: vi.fn(),
      order: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      is: vi.fn(),
      limit: vi.fn(),
      then: vi.fn(),
    };
    for (const key of ["select", "order", "eq", "in", "is", "limit"] as const)
      chain[key].mockReturnValue(chain);
    chain.then.mockImplementation((resolve) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
    );
    return chain;
  });
  mocks.rpc.mockImplementation(async (name) => ({
    data:
      name === "crm_page"
        ? { contacts: [], deals: [], tags: [] }
        : { contacts: 21, overdue: 0, stages: [], sources: [] },
    error: null,
  }));
});
it("loads the initial pipeline without unrelated forms, automations, tasks or global history", async () => {
  const result = await crmRead();
  expect(result.section).toBe("pipeline");
  expect(result.summary.contacts).toBe(21);
  expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
    "crm_stages",
    "team_members",
  ]);
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
    "crm_page",
    "crm_report",
  ]);
});
it.each(["forms", "tasks", "automations"] as const)(
  "loads %s without fetching the contact/project listing",
  async (section) => {
    const result = await crmRead(0, { section });
    expect(result.section).toBe(section);
    expect(mocks.from.mock.calls.map(([table]) => table)).toContain(
      `crm_${section}`,
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith("crm_page", expect.anything());
  },
);
it("fails closed when the database reports an error", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "database internal detail" },
  });
  await expect(crmRead()).rejects.toMatchObject({ status: 503 });
});
