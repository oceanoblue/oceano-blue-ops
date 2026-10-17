import { notFound } from "next/navigation";
import { SchedulingBooking } from "@/components/crm/SchedulingBooking";
import { appointmentByToken } from "@/lib/crm/scheduling-server";
import { sessionTokenSchema } from "@/lib/crm/scheduling-types";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your session · Oceano Blue", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params }: {
    params: Promise<{
        token: string;
    }>;
}) {
    const token = sessionTokenSchema.safeParse((await params).token);
    if (!token.success)
        notFound();
    let a;
    try {
        a = await appointmentByToken(token.data);
    }
    catch {
        notFound();
    }
    const { crmDb } = await import("@/lib/crm/server");
    const { data: type } = a.session_type_id ? await crmDb().from("crm_session_types").select("slug,published,owner_id").eq("id", a.session_type_id).maybeSingle() : { data: null };
    const managed = { appointment: { id: a.id, title: a.title, location: a.location, timezone: a.timezone, full_name: a.full_name, starts_at: a.starts_at, ends_at: a.ends_at, status: a.status, version: a.version,confirmation_instructions:a.confirmation_instructions??"" }, slug: type?.slug ?? "", canReschedule: a.import_state !== "reference" && !!type?.published && type?.owner_id === a.owner_id };
    return <SchedulingBooking token={token.data} type={{ name: a.title, slug: type?.slug ?? "", description: "", duration_minutes: Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000), timezone: a.timezone, location: a.location }} managed={managed} readOnly={process.env.VERCEL_ENV !== "production"}/>;
}
