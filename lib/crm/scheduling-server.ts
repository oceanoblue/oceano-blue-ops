import { createHash, randomBytes } from "node:crypto";
import { fetchMemberBusy } from "@/lib/google-calendar/api";
import { memberWindows } from "@/lib/booking/crew-windows";
import { CrmError, crmDb } from "./server";
import { localSessionDay, sessionSlots, type SessionRange } from "./scheduling-slots";
import { sessionBookingSchema, sessionChangeSchema, sessionRequiresPhone,validSessionPhone,type Appointment, type SessionType, type PublicSessionType, type SchedulingData } from "./scheduling-types";
export function schedulingProduction() {
    if (process.env.VERCEL_ENV !== "production")
        throw new CrmError("Open production Ops to book or change a session.", 403);
}
export function publicSessionType(t: SessionType): PublicSessionType { return { name: t.name, slug: t.slug, description: t.description, duration_minutes: t.duration_minutes, timezone: t.timezone, location: t.location }; }
export async function sessionCalendarWriteAccess(owner: string): Promise<string> {
    const { data, error } = await crmDb().from("team_calendar_connections").select("is_active,scope,account_email").eq("team_member_id", owner).eq("provider", "google").maybeSingle();
    const scopes = new Set(String(data?.scope ?? "").split(/\s+/));
    if (error || !data?.is_active || !data.account_email || !scopes.has("https://www.googleapis.com/auth/calendar") && !scopes.has("https://www.googleapis.com/auth/calendar.events"))
        throw new CrmError("Reconnect the host’s Google calendar with permission to create events before publishing or booking.", 503);
    return String(data.account_email).toLowerCase();
}
export async function readSessionType(slug: string, published = true): Promise<SessionType> {
    let query = crmDb().from("crm_session_types").select("*").eq("slug", slug);
    if (published)
        query = query.eq("published", true);
    const { data, error } = await query.maybeSingle();
    if (error)
        throw new CrmError("Scheduling is temporarily unavailable.", 503);
    if (!data)
        throw new CrmError("This scheduling link is unavailable.", 404);
    return data as SessionType;
}
export async function appointmentByToken(token: string): Promise<Appointment> {
    const { data, error } = await crmDb().from("crm_appointments").select("*").eq("manage_token", token).maybeSingle();
    if (error)
        throw new CrmError("Session details are unavailable.", 503);
    if (!data)
        throw new CrmError("Session not found.", 404);
    return data as Appointment;
}
export function sessionRpcError(error: {
    code?: string;
    message?: string;
} | null) {
    if (!error)
        return;
    if (["23P01", "40001"].includes(error.code ?? ""))
        throw new CrmError(error.code === "23P01" ? "That time is no longer available. Choose another time." : "This session changed. Reload and try again.", 409);
    if (error.code === "42501")
        throw new CrmError("Session access is unavailable.", 403);
    throw new CrmError("Unable to save this session. Reload or contact the office.", 503);
}
export async function sessionAvailability(type: SessionType, day: string, ignoreAppointment?: Appointment) {
    if (!sessionSlots(type, day, []).length)
        return { slots: [], checkedAt: new Date().toISOString() };
    const start = new Date(`${day}T00:00:00Z`).getTime() - 86400000, end = start + 3 * 86400000;
    const from = new Date(start).toISOString(), to = new Date(end).toISOString();
    const db = crmDb();
    const [blocks, orders, external, primary, settings] = await Promise.all([
        db.from("schedule_blocks").select("id,starts_at,ends_at").eq("team_member_id", type.owner_id).eq("is_available", false).lt("starts_at", to).gt("ends_at", from).limit(1201),
        db.from("orders").select("scheduled_at,duration_minutes,photographer_id,videographer_id,photographer_start_offset_minutes,photographer_duration_minutes,videographer_start_offset_minutes,videographer_duration_minutes,contractors(team_member_id)").gte("scheduled_at", from).lte("scheduled_at", to).not("status", "in", "(cancelled,draft)").limit(1201),
        fetchMemberBusy(type.owner_id, from, to),
        sessionCalendarWriteAccess(type.owner_id),
        db.from("business_settings").select("buffer_minutes").eq("id", true).maybeSingle(),
    ]);
    if (blocks.error || orders.error || settings.error || (blocks.data?.length ?? 0) > 1200 || (orders.data?.length ?? 0) > 1200)
        throw new CrmError("Calendar availability could not be verified. Please contact the office.", 503);
    if (external.source !== "own")
        throw new CrmError("The host’s calendar needs to be connected before booking. Please contact the office.", 503);
    const ownEventId = ignoreAppointment ? createHash("sha256").update(`crm-session/${ignoreAppointment.id}`).digest("hex") : null;
    const busy: SessionRange[] = [...external.busy.filter(b => !(ownEventId && b.eventId === ownEventId && b.calendarId?.toLowerCase() === primary)), ...(blocks.data ?? []).filter(b => b.id !== ignoreAppointment?.schedule_block_id).map(b => ({ start: b.starts_at, end: b.ends_at }))];
    // Shoot travel time is additional to the session’s own buffers; CRM-only holds keep their configured buffers.
    const shootBufferMs = (settings.data?.buffer_minutes ?? 30) * 60000;
    for (const row of orders.data ?? []) {
        const o = { ...row, contractors: Array.isArray(row.contractors) ? row.contractors[0] : row.contractors };
        for (const w of memberWindows(o, type.owner_id))
            if (w.start && w.end)
                busy.push({ start: new Date(Date.parse(w.start) - shootBufferMs).toISOString(), end: new Date(Date.parse(w.end) + shootBufferMs).toISOString() });
    }
    return { slots: sessionSlots(type, day, busy), checkedAt: new Date().toISOString() };
}
export async function bookSession(slug: string, input: unknown, smartFileToken?: string) {
    schedulingProduction();
    const booking = sessionBookingSchema.parse(input);
    if (booking.website)
        throw new CrmError("Unable to book. Please contact the office.", 400);
    const hash = createHash("sha256").update(JSON.stringify({ ...booking, starts_at: new Date(booking.starts_at).toISOString(), slug, ...(smartFileToken ? { smart_file_token: smartFileToken } : {}) })).digest("hex");
    const previous = await crmDb().from("crm_appointments").select("id,payload_hash,manage_token,session_type_id,crm_session_types(slug)").eq("id", booking.id).maybeSingle();
    if (previous.error)
        throw new CrmError("Booking is unavailable.", 503);
    if (previous.data) {
        if (previous.data.payload_hash !== hash)
            throw new CrmError("This booking request changed. Reload and try again.", 409);
        return { ok: true, id: previous.data.id, token: previous.data.manage_token };
    }
    const type = await readSessionType(slug);
    if(sessionRequiresPhone(type)&&!validSessionPhone(booking.phone))throw new CrmError("Enter a phone number we can use for this call.",400);
    const available = await sessionAvailability(type, localSessionDay(new Date(booking.starts_at), type.timezone));
    if (!available.slots.includes(new Date(booking.starts_at).toISOString()))
        throw new CrmError("That time is no longer available. Choose another time.", 409);
    const { data, error } = await crmDb().rpc("crm_session_commit", { p_id: booking.id, p_slug: slug, p_hash: hash, p_type_version: type.version, p_calendar_checked_at: available.checkedAt, p_data: { ...booking, ...(smartFileToken ? { smart_file_token: smartFileToken } : {}), manage_token: randomBytes(32).toString("hex") } });
    sessionRpcError(error);
    return data;
}
export async function changeSession(appointment: Appointment, input: unknown, actor: string | null = null) {
    schedulingProduction();
    const change = sessionChangeSchema.parse(input);
    let check: {
        checkedAt: string;
    } | null = null, type: SessionType | null = null;
    if (change.action === "reschedule") {
        const { data, error } = await crmDb().from("crm_session_types").select("*").eq("id", appointment.session_type_id).maybeSingle();
        if (error || !data)
            throw new CrmError("Session availability is unavailable.", 503);
        type = data as SessionType;
        const available = await sessionAvailability(type, localSessionDay(new Date(change.starts_at), type.timezone), appointment);
        if (!available.slots.includes(new Date(change.starts_at).toISOString()))
            throw new CrmError("That time is no longer available. Choose another time.", 409);
        check = available;
    }
    const { data, error } = await crmDb().rpc("crm_session_change", { p_id: appointment.id, p_token: actor ? null : appointment.manage_token, p_actor: actor, p_action: change.action, p_version: change.version, p_start: change.action === "reschedule" ? change.starts_at : null, p_calendar_checked_at: check?.checkedAt ?? null, p_type_version: type?.version ?? null });
    sessionRpcError(error);
    return data;
}
export async function schedulingRead(): Promise<SchedulingData> {
    const db = crmDb(), since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [types, appointments, team, notifications] = await Promise.all([
        db.from("crm_session_types").select("*").order("name").limit(200),
        db.from("crm_appointments").select("id,session_type_id,client_id,project_id,owner_id,title,location,timezone,full_name,email,phone,notes,starts_at,ends_at,status,version,email_consent,created_at,source_system,source_id,source_evidence,import_state").gte("starts_at", since).order("starts_at").limit(500),
        db.from("team_members").select("id,full_name").eq("is_active", true).in("role", ["admin", "coordinator"]).order("full_name"),
        db.from("crm_session_notifications").select("id,appointment_id,kind,status,last_error,due_at").in("status", ["pending", "sending", "needs_review"]).order("due_at").limit(300),
    ]);
    if ([types, appointments, team, notifications].some(r => r.error))
        throw new CrmError("Scheduling is unavailable. Confirm the database migration has been applied.", 503);
    return { types: types.data ?? [], appointments: (appointments.data ?? []) as Appointment[], team: team.data ?? [], notifications: notifications.data ?? [], production: process.env.VERCEL_ENV === "production" };
}
