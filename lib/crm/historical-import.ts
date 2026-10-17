import { parseCsv } from "./csv";
import { historicalProjectSchema } from "./historical-schema";
export function historicalProjectsCsv(input: string) {
  const [header, ...rows] = parseCsv(input);
  if (!header || !rows.length)
    throw new Error("CSV must include column headers and project rows.");
  const keys = header.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const get = (row: string[], names: string[]) =>
    row[keys.findIndex((k) => names.includes(k))]?.trim() || "";
  return rows.map((row, i) => {
    const cents = get(row, ["valuecents"]),
      dollars = get(row, ["value", "projectvalue"]);
    const result = historicalProjectSchema.safeParse({
      source_id: get(row, ["sourceid", "projectid", "honeybookprojectid"]),
      title: get(row, ["title", "projectname", "project"]),
      client_name: get(row, ["clientname", "contactname", "fullname"]),
      client_email: get(row, ["clientemail", "contactemail", "email"]),
      original_stage: get(row, ["originalstage", "stage", "pipelinestage"]),
      project_type: get(row, ["projecttype"]),
      lead_source: get(row, ["leadsource"]),
      project_date: get(row, ["projectdate", "date"]) || null,
      value_cents: cents
        ? Number(cents)
        : dollars
          ? Math.round(Number(dollars.replace(/[$,]/g, "")) * 100)
          : 0,
      description: get(row, ["description", "notes"]),
    });
    if (!result.success)
      throw new Error(
        `Row ${i + 2}: include a stable HoneyBook project ID, project title, client name and email. Dates must use YYYY-MM-DD and values must be valid amounts.`,
      );
    return result.data;
  });
}
