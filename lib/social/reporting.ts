import { z } from "zod";
import { crmDb, CrmError } from "@/lib/crm/server";

export const modes = ["progress","client_managed","agency_report"] as const;
export type ReportingMode = typeof modes[number];
export type MonthlyResult = { source:string; report_url:string; updated_at:string };
export const monthFormat = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const httpsLink = z.string().url().max(1800).refine(v=>{
  const u=new URL(v);return u.protocol==="https:" && !u.username && !u.password;
},"Use an HTTPS report share link.");
export const reportingAction = z.discriminatedUnion("action",[
  z.object({action:z.literal("mode"),program:z.string().uuid(),mode:z.enum(modes)}),
  z.object({action:z.literal("report"),program:z.string().uuid(),month:monthFormat,source:z.string().trim().min(1).max(100),url:httpsLink}),
]);
export async function monthlyResult(program:string,month:string):Promise<MonthlyResult|null> {
  const {data,error}=await crmDb().from("social_monthly_results").select("source,report_url,updated_at")
    .eq("program_id",program).eq("month",month+"-01").maybeSingle();
  if(error) throw new CrmError("The monthly performance report is temporarily unavailable.",503);
  return data as MonthlyResult|null;
}
