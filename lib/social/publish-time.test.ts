import { describe, expect, it } from "vitest";
import { publishTiming, zonedInstant } from "./schema";

describe("when a post is due", () => {
  it("turns a local date and time into the exact moment", () => {
    expect(zonedInstant("2027-01-08", "10:00:00", "America/New_York")?.toISOString()).toBe("2027-01-08T15:00:00.000Z");
    expect(zonedInstant("2027-07-08", "10:00", "America/New_York")?.toISOString()).toBe("2027-07-08T14:00:00.000Z");
    expect(zonedInstant("2027-01-08", "09:30", "America/Chicago")?.toISOString()).toBe("2027-01-08T15:30:00.000Z");
    expect(zonedInstant("2027-01-08", "23:45", "America/Los_Angeles")?.toISOString()).toBe("2027-01-09T07:45:00.000Z");
  });

  it("handles the days the clocks change", () => {
    // Clocks go forward on March 14, 2027 and back on November 7, 2027.
    expect(zonedInstant("2027-03-14", "10:00", "America/New_York")?.toISOString()).toBe("2027-03-14T14:00:00.000Z");
    expect(zonedInstant("2027-03-13", "10:00", "America/New_York")?.toISOString()).toBe("2027-03-13T15:00:00.000Z");
    expect(zonedInstant("2027-11-07", "10:00", "America/New_York")?.toISOString()).toBe("2027-11-07T15:00:00.000Z");
  });

  it("gives nothing when a part is missing or wrong", () => {
    expect(zonedInstant("2027-01-08", "", "America/New_York")).toBeNull();
    expect(zonedInstant(null, "10:00", "America/New_York")).toBeNull();
    expect(zonedInstant("2027-01-08", "10:00", "")).toBeNull();
    expect(zonedInstant("2027-01-08", "10:00", "Not/AZone")).toBeNull();
  });

  it("is due from its time until a day later, then stale", () => {
    const at = new Date("2027-01-08T15:00:00Z");
    expect(publishTiming(at, new Date("2027-01-08T14:59:00Z"))).toEqual({ due: false, stale: false });
    expect(publishTiming(at, new Date("2027-01-08T15:00:00Z"))).toEqual({ due: true, stale: false });
    expect(publishTiming(at, new Date("2027-01-09T14:00:00Z"))).toEqual({ due: true, stale: false });
    expect(publishTiming(at, new Date("2027-01-09T15:00:01Z"))).toEqual({ due: false, stale: true });
    expect(publishTiming(null, new Date())).toEqual({ due: false, stale: false });
  });
});
