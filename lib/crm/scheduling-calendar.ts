import { createHash } from "node:crypto";
import { getAccessToken } from "@/lib/google-calendar/api";
import type { Appointment } from "./scheduling-types";
/** Deterministic Google event IDs make interrupted retries converge. No guests
 * are added, so Calendar never sends invitations or other client messages. */
export async function syncSessionCalendar(a: Appointment) {
    if (a.source_system !== "ops" || a.import_state === "reference")
        return;
    const token = await getAccessToken(a.owner_id);
    if (!token)
        throw new Error("Reconnect the host’s Google calendar.");
    const eventId = createHash("sha256").update(`crm-session/${a.id}`).digest("hex"), base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    const options = { headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000) };
    if (a.status === "cancelled") {
        const r = await fetch(`${base}/${eventId}?sendUpdates=none`, { ...options, method: "DELETE" });
        if (!r.ok && r.status !== 404 && r.status !== 410)
            throw new Error("Calendar cancellation could not be confirmed.");
        return;
    }
    const body = { id: eventId, summary: `${a.title} — ${a.full_name}`, description: `Oceano Blue Ops session\n${a.email}\n${a.phone}\n\nManage this appointment in Ops: https://app.oceanoblue.net/dashboard/crm/scheduling`, location: a.location, start: { dateTime: a.starts_at, timeZone: a.timezone }, end: { dateTime: a.ends_at, timeZone: a.timezone }, transparency: "opaque", attendees: [], extendedProperties: { private: { ops_session_id: a.id, ops_session_version: String(a.version) } } };
    const r = await fetch(`${base}?sendUpdates=none`, { ...options, method: "POST", body: JSON.stringify(body) });
    if (r.ok)
        return;
    if (r.status !== 409)
        throw new Error("Calendar hold could not be confirmed.");
    const patch = await fetch(`${base}/${eventId}?sendUpdates=none`, { ...options, signal: AbortSignal.timeout(10000), method: "PATCH", body: JSON.stringify({ ...body, id: undefined }) });
    if (!patch.ok)
        throw new Error("Calendar hold could not be updated. Check the existing event before retrying.");
}
