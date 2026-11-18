import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import { parseMonth } from "./schema";
import { listPrograms, loadWorkspace, type Program, type Workspace } from "./server";

export type StudioPage = {
  programs: Program[] | null;
  program: Program | null;
  month: string;
  workspace: Workspace | null;
  production: boolean;
};

/**
 * What every Social Studio page starts from: office access, the chosen program
 * (or the first one that is not ended) and the chosen month. `programs` is
 * null when the data could not be loaded, for example before the database
 * update for this feature is installed.
 */
export async function studioPage(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<StudioPage> {
  try {
    await crmActor();
  } catch {
    notFound();
  }
  const params = await searchParams;
  const month = parseMonth(params.month);
  const production = process.env.VERCEL_ENV === "production";
  const programs = await listPrograms().catch(() => null);
  if (!programs) return { programs: null, program: null, month, workspace: null, production };
  const program =
    programs.find((p) => p.id === params.program) ?? programs.find((p) => p.status !== "ended") ?? programs[0] ?? null;
  const workspace = program ? await loadWorkspace(program.id, month).catch(() => null) : null;
  return { programs: program && !workspace ? null : programs, program, month, workspace, production };
}
