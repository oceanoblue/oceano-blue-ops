import { describe, expect, it } from "vitest";
import { auditItem, auditMonth, countIssues, hasError, termsUsed, type AuditAccount, type AuditItem } from "./audit";

const account: AuditAccount = { id: "a1", platforms: ["facebook", "instagram"], avoid_terms: ["cheap"] };
const piece = (over: Partial<AuditItem> = {}): AuditItem => ({
  id: "i1",
  account_id: "a1",
  month: "2027-01-01",
  kind: "post",
  title: "Breakfast",
  caption: "Start your morning with a hot breakfast. #hotel",
  status: "approved",
  scheduled_for: "2027-01-12",
  assignee: "t1",
  design_url: "https://www.canva.com/design/x",
  ...over,
});
const codes = (item: AuditItem, acct = account, over: Partial<{ today: string; programAvoid: string[]; repeated: boolean }> = {}) =>
  auditItem(item, acct, { today: "2027-01-05", programAvoid: [], repeated: false, ...over }).map((i) => `${i.severity}:${i.code}`);

describe("checks on one piece", () => {
  it("passes a complete approved piece and stays quiet about pieces nobody has started", () => {
    expect(codes(piece())).toEqual([]);
    expect(codes(piece({ status: "planned", caption: "", design_url: "", assignee: null }))).toEqual([]);
  });
  it("requires a caption and a date once a piece is ready, and asks for a design link", () => {
    expect(codes(piece({ caption: "  ", design_url: "", scheduled_for: null }))).toEqual(["error:no_caption", "warning:no_design", "error:no_date"]);
    expect(codes(piece({ status: "in_design", caption: "", design_url: "" }))).toEqual([]);
  });
  it("flags dates that have passed, differently for scheduled, unscheduled and published work", () => {
    expect(codes(piece({ status: "scheduled", scheduled_for: "2027-01-04" }))).toEqual(["warning:unconfirmed"]);
    expect(codes(piece({ status: "in_design", scheduled_for: "2027-01-04" }))).toEqual(["warning:late"]);
    expect(codes(piece({ status: "published", scheduled_for: "2027-01-04" }))).toEqual([]);
    expect(codes(piece({ scheduled_for: "2027-01-05" }))).toEqual([]);
    expect(codes(piece({ scheduled_for: "2027-02-01" }))).toEqual(["warning:wrong_month"]);
  });
  it("flags production work that nobody owns", () => {
    expect(codes(piece({ status: "needs_media", assignee: null }))).toEqual(["warning:unassigned"]);
  });
  it("measures length against the platforms the piece actually goes to", () => {
    const long = "a".repeat(300);
    expect(codes(piece({ caption: long }))).toEqual([]);
    expect(codes(piece({ caption: long }), { ...account, platforms: ["facebook", "x"] })).toEqual(["warning:too_long_x"]);
    expect(codes(piece({ caption: "a".repeat(2201) }))).toEqual(["error:too_long_instagram"]);
    // A Google post is checked against Google only, whatever else the account is on.
    expect(codes(piece({ kind: "google_post", caption: "a".repeat(1501) }), { ...account, platforms: ["facebook", "instagram", "google"] })).toEqual(["error:too_long_google"]);
    expect(codes(piece({ caption: "a".repeat(1501) }), { ...account, platforms: ["facebook", "google"] })).toEqual([]);
  });
  it("applies Instagram's hashtag and link rules only on Instagram", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    expect(codes(piece({ caption: tags }))).toEqual(["error:too_many_hashtags"]);
    expect(codes(piece({ caption: tags }), { ...account, platforms: ["facebook"] })).toEqual([]);
    expect(codes(piece({ caption: "Book at https://example.com today" }))).toEqual(["warning:link_in_caption"]);
    expect(codes(piece({ kind: "google_post", caption: "Book at https://example.com today" }), { ...account, platforms: ["instagram", "google"] })).toEqual([]);
  });
  it("catches terms to avoid from the account and the program as whole words, in any case", () => {
    expect(termsUsed("Our CHEAP rates", ["cheap"])).toEqual(["cheap"]);
    expect(termsUsed("Cheaper than ever", ["cheap"])).toEqual([]);
    expect(termsUsed("The best in town!", ["best in town", "c++", " "])).toEqual(["best in town"]);
    expect(termsUsed("We use c++ here", ["c++"])).toEqual(["c++"]);
    expect(codes(piece({ caption: "Cheap rooms, world-class views" }), account, { programAvoid: ["world-class"] })).toEqual(["error:avoid_term"]);
  });
  it("catches shouting, leftover placeholders and repeats", () => {
    expect(codes(piece({ caption: "BOOK YOUR STAY WITH US THIS WEEKEND" }))).toEqual(["warning:all_caps"]);
    expect(codes(piece({ caption: "Join us for [event name] this Friday" }))).toEqual(["error:placeholder"]);
    expect(codes(piece(), account, { repeated: true })).toEqual(["error:repeated"]);
  });
});

describe("checks on a month", () => {
  it("flags the same caption twice on one account but not across accounts, and skips clean pieces", () => {
    const other: AuditAccount = { id: "a2", platforms: ["facebook"], avoid_terms: [] };
    const audit = auditMonth(
      [
        piece({ id: "i1" }),
        piece({ id: "i2", caption: "  start your morning with a HOT breakfast.   #hotel " }),
        piece({ id: "i3", account_id: "a2" }),
        piece({ id: "i4", caption: "Something else entirely" }),
        piece({ id: "i5", account_id: "gone" }),
      ],
      [account, other],
      [],
      "2027-01-05",
    );
    expect(Object.keys(audit).sort()).toEqual(["i1", "i2"]);
    expect(hasError(audit.i1)).toBe(true);
    expect(hasError(audit.i4)).toBe(false);
    expect(countIssues(audit)).toEqual({ errors: 2, warnings: 0, pieces: 2 });
  });
});
