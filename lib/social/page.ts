import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import type { Issue } from "./audit";
import { parseMonth, todayKey } from "./schema";
import { clientMonth, type AccountRow, type ClientSummary } from "./summary";
import { getProgram, listPrograms, loadWorkspace, type Program, type Workspace } from "./server";

type Search = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Office access for a Social Studio page. Anyone else gets "not found". */
async function office() {
  try {
    await crmActor();
  } catch {
    notFound();
  }
}

export type ClientCard = { program: Program; summary: ClientSummary };
export type SocialHome = {
  /** Null when the data could not be loaded, for example before a database update is installed. */
  clients: ClientCard[] | null;
  month: string;
  production: boolean;
};

/** The Social Media front page: every client, with this month at a glance. */
export async function socialHome(searchParams: Search): Promise<SocialHome> {
  await office();
  const month = parseMonth((await searchParams).month);
  const production = process.env.VERCEL_ENV === "production";
  const today = todayKey();
  try {
    const programs = await listPrograms();
    const months = await Promise.all(programs.map((p) => loadWorkspace(p.id, month)));
    return { clients: programs.map((program, i) => ({ program, summary: clientMonth(program, months[i], today).summary })), month, production };
  } catch {
    return { clients: null, month, production };
  }
}

export type ClientPage = {
  program: Program;
  month: string;
  today: string;
  workspace: Workspace;
  /** Automatic check results for the month, by piece id. Pieces with no issues are absent. */
  audit: Record<string, Issue[]>;
  /** One row per active sub-account. */
  rows: AccountRow[];
  summary: ClientSummary;
  production: boolean;
};

/**
 * What every page of one client starts from: office access, the client and
 * the chosen month. An unknown client is "not found".
 */
export async function clientPage(params: Promise<{ id: string }>, searchParams: Search): Promise<ClientPage> {
  await office();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const month = parseMonth((await searchParams).month);
  const program = await getProgram(id);
  if (!program) notFound();
  const workspace = await loadWorkspace(program.id, month);
  const today = todayKey();
  return { program, month, today, workspace, ...clientMonth(program, workspace, today), production: process.env.VERCEL_ENV === "production" };
}

/**
 * Where an old Social Studio link (…/board?program=…) lives now. Without a
 * client in the link it goes to the client list.
 */
export async function legacyTarget(searchParams: Search): Promise<{ clientId: string | null; month: string | null }> {
  const params = await searchParams;
  const program = typeof params.program === "string" && UUID.test(params.program) ? params.program : null;
  const month = typeof params.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  return { clientId: program, month };
}
