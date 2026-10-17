import { expect, it } from "vitest";
import { appointmentTimeLabel } from "./appointment-time";
it("labels the wedding date hold without inventing a midnight coverage time", () => {
  const label = appointmentTimeLabel({ starts_at: "2027-01-07T05:00:00Z", ends_at: "2027-01-08T05:00:00Z", timezone: "America/New_York", source_evidence: { all_day: true } });
  expect(label).toBe("Thu, Jan 7, 2027 · All-day hold; confirm coverage times");
});
it("shows the full duration of an upcoming filming commitment", () => {
  expect(appointmentTimeLabel({ starts_at: "2026-10-19T13:00:00Z", ends_at: "2026-10-19T21:00:00Z", timezone: "America/New_York" })).toBe("Mon, Oct 19, 2026, 9:00 AM – 5:00 PM");
});
it("preserves the local end date for overnight work", () => {
  expect(appointmentTimeLabel({ starts_at: "2026-11-22T04:00:00Z", ends_at: "2026-11-22T06:00:00Z", timezone: "America/New_York" })).toBe("Sat, Nov 21, 2026, 11:00 PM – Sun, Nov 22, 2026, 1:00 AM");
});
it("uses the exclusive final date for a multi-day hold spanning DST", () => {
  expect(appointmentTimeLabel({ starts_at: "2027-03-13T05:00:00Z", ends_at: "2027-03-15T04:00:00Z", timezone: "America/New_York", source_evidence: { all_day: true } })).toBe("Sat, Mar 13, 2027 – Sun, Mar 14, 2027 · All-day hold; confirm coverage times");
});
