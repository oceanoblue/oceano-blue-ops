import { contactSchema } from "./types";
// RFC 4180 quoting, CRLF and embedded line breaks. Never split a CSV on commas.
export function parseCsv(input: string): string[][] {
  if (input.length > 2000000) throw new Error("CSV must be under 2 MB.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  input = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') {
      if (cell) throw new Error("Invalid CSV quoting.");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed quoted field.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (rows.length > 501) throw new Error("Import up to 500 contacts per CSV.");
  return rows;
}
export function csvContacts(input: string) {
  const [header, ...rows] = parseCsv(input);
  if (!header || !rows.length)
    throw new Error("CSV must contain headers and contacts.");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const h = header.map(norm);
  const value = (row: string[], names: string[]) =>
    row[h.findIndex((x) => names.includes(x))]?.trim() || "";
  return rows.map((row, i) => {
    const full =
      value(row, ["fullname", "name", "contactname"]) ||
      [value(row, ["firstname"]), value(row, ["lastname"])]
        .filter(Boolean)
        .join(" ");
    const result = contactSchema.safeParse({
      full_name: full,
      email: value(row, ["email", "emailaddress", "contactemail"]),
      phone: value(row, ["phone", "phonenumber", "mobile"]),
      company: value(row, ["company", "companyname", "brokerage"]),
      notes: value(row, ["notes", "note"]),
      billing_address: value(row, ["address", "billingaddress"]),
      tags: value(row, ["tags"])
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean),
      status: "lead",
    });
    if (!result.success)
      throw new Error(
        `Row ${i + 2}: name and valid email are required; check field lengths.`,
      );
    return result.data;
  });
}
export function toCsv(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let s = String(value ?? "");
          if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replace(/"/g, '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
