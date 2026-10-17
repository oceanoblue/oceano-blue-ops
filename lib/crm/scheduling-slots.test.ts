import { describe, it, expect } from "vitest";
import { sessionSlots, sessionCalendarFile, validSessionDay,sessionMonthHorizon } from "./scheduling-slots";
import { sessionTypeSchema, type SessionType } from "./scheduling-types";
const base: SessionType = { id: "00000000-0000-4000-8000-000000000001", version: 1, name: "Planning", slug: "planning", description: "",confirmation_instructions:"",owner_id: "00000000-0000-4000-8000-000000000002", duration_minutes: 30, timezone: "America/New_York", availability: [{ day: 1, start: "09:00", end: "12:00" }], notice_minutes: 60, horizon_days: 90, booking_horizon_months: null, slot_interval_minutes:15, use_session_as_project_date:false, buffer_minutes: 15,buffer_before_minutes:null,buffer_after_minutes:null, location: "Phone", published: true };
const now = new Date("2026-10-17T12:00:00Z");
describe("session availability", () => {
    it("uses host wall time and blocks buffers around external commitments", () => {
        const all = sessionSlots(base, "2026-10-19", [], now);
        expect(all[0]).toBe("2026-10-19T13:00:00.000Z");
        const slots = sessionSlots(base, "2026-10-19", [{ start: "2026-10-19T13:45:00Z", end: "2026-10-19T14:30:00Z" }], now);
        expect(slots).toContain("2026-10-19T13:00:00.000Z");
        expect(slots).not.toContain("2026-10-19T13:15:00.000Z");
        expect(slots).not.toContain("2026-10-19T14:30:00.000Z");
        expect(slots).toContain("2026-10-19T14:45:00.000Z");
    });
    it("keeps distinct preparation and recovery buffers, including explicit zero", () => {
        const busy = [{ start: "2026-10-19T14:00:00Z", end: "2026-10-19T14:30:00Z" }];
        const type = { ...base, buffer_minutes: 15, buffer_before_minutes: 0, buffer_after_minutes: 60 };
        const slots = sessionSlots(type, "2026-10-19", busy, now);
        expect(slots).not.toContain("2026-10-19T13:00:00.000Z");
        expect(slots).toContain("2026-10-19T14:30:00.000Z");
        const reversed = sessionSlots({ ...type, buffer_before_minutes: 60, buffer_after_minutes: 0 }, "2026-10-19", busy, now);
        expect(reversed).toContain("2026-10-19T13:30:00.000Z");
        expect(reversed).not.toContain("2026-10-19T14:30:00.000Z");
        expect(reversed).toContain("2026-10-19T15:30:00.000Z");
    });
    it("enforces notice, horizon, weekday, and real dates", () => {
        expect(sessionSlots(base, "2026-10-18", [], now)).toEqual([]);
        expect(sessionSlots(base, "2027-10-18", [], now)).toEqual([]);
        expect(sessionSlots(base, "2026-10-19", [], new Date("2026-10-19T14:00:00Z"))[0]).toBe("2026-10-19T15:00:00.000Z");
        expect(validSessionDay("2026-02-30")).toBe(false);
    });
    it("skips nonexistent spring-forward times and keeps valid DST slots", () => {
        const t = { ...base, availability: [{ day: 0, start: "01:00", end: "04:00" }], notice_minutes: 30 };
        const s = sessionSlots(t, "2027-03-14", [], new Date("2027-03-10T12:00:00Z"));
        expect(s).toContain("2027-03-14T07:30:00.000Z");
        expect(s).toHaveLength(7);
        expect(s.every(v => !Number.isNaN(Date.parse(v)))).toBe(true);
    });
    it("supports full-day production sessions and rejects unsafe configuration", () => {
        expect(sessionTypeSchema.safeParse({ ...base, duration_minutes: 480 }).success).toBe(true);
        expect(sessionTypeSchema.safeParse({ ...base, notice_minutes: 0 }).success).toBe(true);
        expect(sessionTypeSchema.safeParse({ ...base, timezone: "bad-zone" }).success).toBe(false);
        expect(sessionSlots({ ...base, duration_minutes: 480, availability: [{ day: 1, start: "09:00", end: "17:00" }] }, "2026-10-19", [], now)).toEqual(["2026-10-19T13:00:00.000Z"]);
    });
    it("keeps fall-back wall-clock slots deterministic without duplicate instants", () => {
        const t = { ...base, availability: [{ day: 0, start: "01:00", end: "03:00" }] };
        const s = sessionSlots(t, "2027-11-07", [], new Date("2027-11-01T12:00:00Z"));
        expect(s).toHaveLength(7);
        expect(new Set(s).size).toBe(s.length);
        expect(s).toContain("2027-11-07T07:00:00.000Z");
    });
    it("escapes calendar text and publishes UTC instants", () => {
        const text = sessionCalendarFile({ id: "test", title: "Call, planning;\nBEGIN:BAD", location: "Studio", starts_at: "2026-10-19T13:00:00Z", ends_at: "2026-10-19T13:30:00Z", status: "confirmed" });
        expect(text).toContain("DTSTART:20261019T130000Z\r\n");
        expect(text).toContain("SUMMARY:Call\\, planning\\;\\nBEGIN:BAD");
        expect(text).not.toContain("\r\nBEGIN:BAD");
    });
    it("preserves configured start increments and exact calendar-month cutoffs",()=>{
        const type={...base,duration_minutes:15,slot_interval_minutes:30,booking_horizon_months:2,availability:[{day:1,start:"09:00",end:"10:00"}]};
        expect(sessionSlots(type,"2026-10-19",[],now)).toEqual(["2026-10-19T13:00:00.000Z","2026-10-19T13:30:00.000Z"]);
        expect(sessionMonthHorizon("2027-01-31",1)).toBe("2027-02-28");expect(sessionMonthHorizon("2027-01-31",2)).toBe("2027-03-31");expect(sessionMonthHorizon("2028-02-29",12)).toBe("2029-02-28");
        const last={...type,availability:[{day:4,start:"09:00",end:"10:00"}]};expect(sessionSlots(last,"2026-12-17",[],now).length).toBe(2);expect(sessionSlots({...last,availability:[{day:5,start:"09:00",end:"10:00"}]},"2026-12-18",[],now)).toEqual([]);
    });
});
