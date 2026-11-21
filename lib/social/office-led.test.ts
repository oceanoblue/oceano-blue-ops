import { describe, expect, it } from "vitest";
import { clientCreativeHref, officeCreativeHref } from "./links";
import { actionSchema, clockLabel, publishTimeLabel, readyToAuthorize, zoneLabel } from "./schema";

const ID = "3f2b8f0e-6a0e-4c6b-9d3a-0f6a2f1f7c11";
const OTHER = "9a1c7d52-4f0b-4e7a-8b1e-2f1d3c4b5a69";

describe("clients who let the office decide what to post", () => {
  it("is ready to authorize with a caption and a date, with or without a file", () => {
    const piece = { status: "internal_review" as const, caption: "Fresh pasta, made this morning.", scheduled_for: "2027-01-08", client_decision: "" };
    expect(readyToAuthorize(piece)).toBe(true);
    expect(readyToAuthorize({ ...piece, status: "client_review" })).toBe(true);
    expect(readyToAuthorize({ ...piece, caption: "   " })).toBe(false);
    expect(readyToAuthorize({ ...piece, scheduled_for: null })).toBe(false);
    expect(readyToAuthorize({ ...piece, client_decision: "changes" })).toBe(false);
    expect(readyToAuthorize({ ...piece, status: "in_design" })).toBe(false);
    expect(readyToAuthorize({ ...piece, status: "approved" })).toBe(false);
  });

  it("accepts the office actions and rejects malformed ones", () => {
    expect(actionSchema.safeParse({ action: "authorize_ready", program_id: ID, month: "2027-01" }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "authorize_ready", program_id: ID, month: "2027-01", ids: [OTHER] }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "authorize_ready", program_id: "nope", month: "2027-01" }).success).toBe(false);
    const mark = { action: "mark_delivered", program_id: ID, event: "scheduled", items: [{ id: OTHER, revision: 2 }] };
    expect(actionSchema.safeParse(mark).success).toBe(true);
    expect(actionSchema.safeParse({ ...mark, event: "published", published_url: "https://www.instagram.com/p/abc/" }).success).toBe(true);
    expect(actionSchema.safeParse({ ...mark, event: "published", published_url: "http://insecure.example/post" }).success).toBe(false);
    expect(actionSchema.safeParse({ ...mark, event: "approved" }).success).toBe(false);
    expect(actionSchema.safeParse({ ...mark, items: [] }).success).toBe(false);
  });
});

describe("what a client reads on their page", () => {
  it("writes the publish time the way a person would", () => {
    expect(clockLabel("10:00:00")).toBe("10:00 AM");
    expect(clockLabel("00:05")).toBe("12:05 AM");
    expect(clockLabel("12:30")).toBe("12:30 PM");
    expect(clockLabel("17:45:00")).toBe("5:45 PM");
    expect(clockLabel("")).toBe("");
    expect(clockLabel(null)).toBe("");
    expect(zoneLabel("America/New_York")).toBe("Eastern");
    expect(zoneLabel("America/Chicago")).toBe("Central");
    expect(zoneLabel("Europe/Lisbon")).toBe("Lisbon time");
    expect(zoneLabel("")).toBe("");
    expect(publishTimeLabel("10:00", "America/New_York")).toBe("10:00 AM Eastern");
    expect(publishTimeLabel("10:00", "")).toBe("10:00 AM");
    expect(publishTimeLabel("", "America/New_York")).toBe("");
  });

  it("loads creatives from the public route, never the signed-in one", () => {
    // The office route needs a session, so a client sent there would see a broken image.
    expect(clientCreativeHref(ID, 3)).toBe(`/api/social-public/creative/${ID}?revision=3`);
    expect(officeCreativeHref(ID, 3)).toBe(`/api/social/creative/${ID}?revision=3`);
    expect(clientCreativeHref(ID, 1).startsWith("/api/social-public/")).toBe(true);
  });
});
