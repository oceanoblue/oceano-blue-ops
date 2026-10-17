import { describe, it, expect } from "vitest";
import { csvContacts, parseCsv, toCsv } from "./csv";
import { defaultFields, validateAnswers, formSchema } from "./types";
describe("CSV migration", () => {
  it("handles HoneyBook names, UTF-8 BOM, quotes, commas, CRLF and embedded newlines", () => {
    const contacts = csvContacts(
      '\uFEFFFirst name,Last name,Email,Phone,Notes\r\nAna,María,ANA@example.com,843,"Line one, \"\"quoted\"\"\nLine two"\r\n',
    );
    expect(contacts[0]).toMatchObject({
      full_name: "Ana María",
      email: "ana@example.com",
      phone: "843",
      notes: 'Line one, "quoted"\nLine two',
    });
  });
  it("rejects missing email and unclosed quotes", () => {
    expect(() => csvContacts("Name,Email\nAna,")).toThrow(/Row 2/);
    expect(() => parseCsv('"Unclosed')).toThrow(/Unclosed/);
  });
  it("neutralizes spreadsheet formulas in exports", () => {
    expect(toCsv([['=WEBSERVICE("secret")', " +CMD", "normal"]])).toBe(
      '"\'=WEBSERVICE(""secret"")","\' +CMD","normal"',
    );
  });
});
describe("Inquiry validation", () => {
  it("validates required canonical fields and strips unknown values", () => {
    expect(
      validateAnswers(defaultFields, {
        full_name: " Ana ",
        email: "ANA@EXAMPLE.COM",
        unexpected: "injected",
      }),
    ).toMatchObject({ full_name: "Ana", email: "ana@example.com" });
    expect(
      validateAnswers(defaultFields, {
        full_name: "Ana",
        email: "a@test.com",
        unexpected: "injected",
      }),
    ).not.toHaveProperty("unexpected");
  });
  it("validates dates and select choices", () => {
    expect(() =>
      validateAnswers(defaultFields, {
        full_name: "Ana",
        email: "a@test.com",
        project_date: "2026-02-30",
      }),
    ).toThrow();
    expect(() =>
      validateAnswers(
        [
          {
            key: "service",
            label: "Service",
            type: "select",
            required: true,
            options: ["Photo"],
          },
        ],
        { service: "Fake" },
      ),
    ).toThrow();
  });
  it("requires name and email in every published or draft form", () => {
    expect(
      formSchema.safeParse({
        name: "Test",
        slug: "test",
        title: "Test",
        success_message: "Thanks",
        fields: [],
      }).success,
    ).toBe(false);
  });
});
