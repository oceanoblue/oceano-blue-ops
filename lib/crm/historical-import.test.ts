import { it, expect } from "vitest";
import { historicalProjectsCsv } from "./historical-import";
import { actions } from "./types";
it("reads prepared project CSV and preserves the original stage for history", () => {
  const rows = historicalProjectsCsv(
    'Project ID,Project name,Client name,Client email,Stage,Project date,Value\nhb001,Finished film,Ana,ANA@example.com,Follow-up,2020-02-03,"$2,500.50"',
  );
  expect(rows[0]).toMatchObject({
    source_id: "hb001",
    title: "Finished film",
    client_email: "ana@example.com",
    original_stage: "Follow-up",
    project_date: "2020-02-03",
    value_cents: 250050,
  });
});
it("does not mistake a contact CSV for a project export", () => {
  expect(() =>
    historicalProjectsCsv("Full name,Email\nAna,ana@example.com"),
  ).toThrow(/stable HoneyBook project ID/);
});
it("rejects invalid project dates and source IDs before import", () => {
  expect(() =>
    historicalProjectsCsv(
      "Project ID,Project name,Client name,Client email,Project date\nhb1,Film,Ana,a@example.com,2020-02-30",
    ),
  ).toThrow();
  expect(
    actions.safeParse({
      action: "historical_project_import",
      id: "11111111-1111-4111-8111-111111111111",
      data: { projects: [] },
    }).success,
  ).toBe(false);
});
