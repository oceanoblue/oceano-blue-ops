import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getAccessToken } from "@/lib/google-calendar/api";
import { calendarNeedsReconnect } from "@/lib/google-calendar/health";
import { loadInbox } from "./gmail";
import { dayBounds, localClock } from "./time";
import type { DayEvent, OperationsSnapshot, WorkItem } from "./types";

const CLOSED = ["delivered", "approved", "archived", "cancelled"];
export function classify(status: string): WorkItem["lane"] {
  if (["ready", "ready_to_deliver"].includes(status)) return "deliver";
  if (["needs_review", "needs_revision", "submitted"].includes(status))
    return "review";
  if (
    [
      "editing",
      "processing",
      "in_progress",
      "waiting_on_editor",
      "waiting_on_ai",
    ].includes(status)
  )
    return "editing";
  if (["uploaded", "media_received", "ingesting"].includes(status))
    return "prepare";
  return "other";
}
export function findConflicts(events: DayEvent[]) {
  const timed = events
    .filter((e) => !e.allDay)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const pairs: string[][] = [];
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      if (Date.parse(timed[j].start) >= Date.parse(timed[i].end)) break;
      pairs.push([timed[i].id, timed[j].id]);
    }
  return pairs;
}
export function prioritize(items: WorkItem[]) {
  return items.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      Number(b.rush) - Number(a.rush) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.updated.localeCompare(b.updated),
  );
}
export async function calendarEvents(
  userId: string,
  day: string,
  timezone: string,
): Promise<DayEvent[]> {
  const token = await getAccessToken(userId);
  if (!token) throw new Error("Reconnect Google Calendar to verify your day.");
  const bounds = dayBounds(day, timezone);
  const events: DayEvent[] = [];
  let page: string | undefined;
  for (let i = 0; i < 5; i++) {
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    Object.entries({
      timeMin: bounds.start,
      timeMax: bounds.end,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: timezone,
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    if (page) url.searchParams.set("pageToken", page);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error(
        "Calendar could not be refreshed. Availability is unverified.",
      );
    const data = await response.json();
    for (const e of data.items ?? []) {
      if (
        e.status === "cancelled" ||
        e.transparency === "transparent" ||
        e.attendees?.some(
          (a: { self?: boolean; responseStatus?: string }) =>
            a.self && a.responseStatus === "declined",
        )
      )
        continue;
      if (!e.start?.dateTime && !e.start?.date) continue;
      events.push({
        id: `gcal:${e.id}`,
        title: e.summary ?? "Untitled event",
        start: e.start.dateTime ?? e.start.date,
        end: e.end?.dateTime ?? e.end?.date ?? e.start.date,
        allDay: !e.start.dateTime,
        source: "calendar",
        href:
          typeof e.htmlLink === "string" &&
          e.htmlLink.startsWith("https://calendar.google.com/")
            ? e.htmlLink
            : null,
        location: e.location,
      });
    }
    page = data.nextPageToken;
    if (!page) return events;
  }
  throw new Error("Calendar has too many events to verify the complete day.");
}

export async function loadSnapshot(
  db: SupabaseClient<Database>,
  userId: string,
  timezone: string,
  now = new Date(),
): Promise<OperationsSnapshot> {
  const day = localClock(now, timezone).date;
  const [orders, jobs, assignments, batches, team, connection, failures, inbox] =
    await Promise.all([

      db
        .from("orders")
        .select(
          "id, order_number, status, scheduled_at, duration_minutes, updated_at, rush, editor_id, job_id, gcal_event_id, listings(address_line1,city), clients(full_name)",
        )
        .is("archived_at", null)
        .not("status", "in", "(cancelled,delivered)")
        .order("updated_at", { ascending: false })
        .limit(500),
      db
        .from("jobs")
        .select(
          "id, title, status, due_date, scheduled_at, updated_at, priority, assigned_to, next_action, clients(full_name)",
        )
        .not("status", "in", `(${CLOSED.join(",")})`)
        .order("updated_at", { ascending: false })
        .limit(500),
      db
        .from("editor_assignments")
        .select(
          "id,job_id,editor_name,editor_type,editor_user_id,status,brief,due_date,created_at",
        )
        .not("status", "in", "(closed,cancelled,approved)")
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("external_edit_batches")
        .select("id,order_id,provider,status,photo_count,created_at")
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1000),
      db.from("team_members").select("id,full_name").eq("is_active", true),
      db
        .from("team_calendar_connections")
        .select("is_active,scope")
        .eq("team_member_id", userId)
        .eq("provider", "google")
        .maybeSingle(),
      db
        .from("tool_runs")
        .select("id", { head: true, count: "exact" })
        .eq("status", "failed")
        .gte("created_at", new Date(now.getTime() - 86400000).toISOString()),
      loadInbox(userId),
    ]);
  // A partial production query must never be presented as an empty pipeline.
  const sources = [orders, jobs, assignments, batches, team];
  if (sources.some((result) => result.error))
    throw new Error(
      "Production data could not be loaded. Refresh before making assignments.",
    );
  const warnings: string[] = [];
  if (
    orders.data?.length === 500 ||
    jobs.data?.length === 500 ||
    assignments.data?.length === 1000 ||
    batches.data?.length === 1000
  )
    warnings.push(
      "This view reached its record limit. Open Orders or Jobs for the complete queue.",
    );
  if (failures.error) warnings.push("Automation health could not be checked.");
  else if (failures.count)
    warnings.push(
      `${failures.count} failed tool run(s) in the last 24 hours. Review Automations and Workers.`,
    );
  const names = new Map((team.data ?? []).map((m) => [m.id, m.full_name]));
  const jobMap = new Map((jobs.data ?? []).map((j) => [j.id, j]));
  const usedJobs = new Set<string>();
  const items: WorkItem[] = [];
  const events: DayEvent[] = [];
  let calendar: OperationsSnapshot["calendar"] = {
    status: "disconnected",
    message:
      "Connect Google Calendar to include meetings and personal commitments.",
  };
  if (connection.error)
    calendar = {
      status: "error",
      message: "Calendar connection could not be checked.",
    };
  else if (connection.data && !calendarNeedsReconnect(connection.data)) {
    try {
      events.push(...(await calendarEvents(userId, day, timezone)));
      calendar = {
        status: "connected",
        message: "Primary calendar refreshed for this view.",
      };
    } catch (error) {
      calendar = {
        status: "error",
        message:
          error instanceof Error ? error.message : "Calendar unavailable.",
      };
    }
  } else if (connection.data)
    calendar = {
      status: "error",
      message: "Reconnect Google Calendar to verify your schedule.",
    };
  function addSchedule(item: WorkItem, gcalId?: string | null) {
    if (
      !item.scheduled ||
      localClock(new Date(item.scheduled), timezone).date !== day
    )
      return;
    if (gcalId && events.some((e) => e.id === `gcal:${gcalId}`)) return;
    events.push({
      id: `${item.kind}:${item.id}`,
      title: item.title,
      start: item.scheduled,
      end: new Date(
        Date.parse(item.scheduled) + (item.duration ?? 60) * 60000,
      ).toISOString(),
      allDay: false,
      source: "shoot",
      href: item.href,
    });
    if (!item.duration)
      warnings.push(
        `Duration not set for ${item.title}; schedule displays a 60-minute estimate.`,
      );
  }
  for (const order of orders.data ?? []) {
    const job = order.job_id ? jobMap.get(order.job_id) : undefined;
    if (order.job_id) usedJobs.add(order.job_id);
    const batch = batches.data?.find((b) => b.order_id === order.id);
    const assignment =
      job && assignments.data?.find((a) => a.job_id === job.id);
    let lane = classify(order.status);
    if (assignment?.status === "draft") lane = "prepare";
    if (
      assignment &&
      ["assigned", "accepted", "in_progress", "needs_revision"].includes(
        assignment.status,
      )
    )
      lane = "editing";
    if (assignment?.status === "submitted" || job?.status === "needs_review")
      lane = "review";
    if (batch?.status === "export_ready") lane = "prepare";
    if (batch?.status === "sent") lane = "editing";
    if (batch?.status === "returned") lane = "review";
    if (["ready", "ready_to_deliver"].includes(order.status)) lane = "deliver";
    const editor =
      assignment?.editor_name ||
      (assignment?.editor_user_id
        ? names.get(assignment.editor_user_id)
        : null) ||
      (order.editor_id ? names.get(order.editor_id) : null) ||
      (batch ? batch.provider : null) ||
      null;
    const route: WorkItem["route"] = assignment
      ? ["internal", "ai_assisted"].includes(assignment.editor_type)
        ? "internal"
        : "external"
      : batch
        ? "external"
        : order.editor_id
          ? "internal"
          : "unassigned";
    const blockers =
      lane === "prepare"
        ? [
            ...(!editor ? ["Choose an editor"] : []),
            ...(batch?.status !== "export_ready"
              ? ["Confirm media and editing brief"]
              : []),
          ]
        : [];
    const item: WorkItem = {
      id: order.id,
      kind: "order",
      title: order.listings?.address_line1 || `Order #${order.order_number}`,
      client: order.clients?.full_name ?? "No client",
      href: `/dashboard/orders/${order.id}`,
      status: order.status,
      due: assignment?.due_date ?? job?.due_date ?? null,
      scheduled: order.scheduled_at,
      duration: order.duration_minutes,
      updated: order.updated_at,
      rush: order.rush,
      editor,
      route,
      lane,
      blockers,
      overdue: false,
      next:
        lane === "prepare"
          ? batch?.status === "export_ready"
            ? `Export prepared: ${batch.photo_count} photos. Confirm the editor has received them.`
            : "Prepare originals, references, and delivery requirements."
          : lane === "review"
            ? "Review returned media before client delivery."
            : lane === "deliver"
              ? "Check the final selection and release delivery."
              : batch?.status === "sent"
                ? `Awaiting return from ${batch.provider}.`
                : (job?.next_action ?? "Open production workspace."),
    };
    item.overdue = !!item.due && item.due < day;
    items.push(item);
    addSchedule(item, order.gcal_event_id);
  }
  for (const job of jobs.data ?? []) {
    if (usedJobs.has(job.id)) continue;
    const assignment = assignments.data?.find((a) => a.job_id === job.id);
    let lane = classify(job.status);
    if (assignment?.status === "draft") lane = "prepare";
    if (
      assignment &&
      ["assigned", "accepted", "in_progress", "needs_revision"].includes(
        assignment.status,
      )
    )
      lane = "editing";
    if (assignment?.status === "submitted") lane = "review";
    if (job.status === "ready_to_deliver") lane = "deliver";
    const editor =
      assignment?.editor_name ||
      (assignment?.editor_user_id
        ? names.get(assignment.editor_user_id)
        : null) ||
      null;
    const due = assignment?.due_date ?? job.due_date;
    const item: WorkItem = {
      id: job.id,
      kind: "job",
      title: job.title,
      client: job.clients?.full_name ?? "No client",
      href: `/dashboard/jobs/${job.id}`,
      status: job.status,
      due,
      scheduled: job.scheduled_at,
      duration: null,
      updated: job.updated_at,
      rush: ["rush", "high"].includes(job.priority),
      editor,
      route: assignment
        ? ["internal", "ai_assisted"].includes(assignment.editor_type)
          ? "internal"
          : "external"
        : "unassigned",
      lane,
      blockers:
        lane === "prepare"
          ? [
              ...(!editor ? ["Choose an editor"] : []),
              ...(!assignment?.brief ? ["Editing brief missing"] : []),
              "Verify source-media access",
            ]
          : [],
      overdue: !!due && due < day,
      next:
        job.next_action ??
        (lane === "prepare"
          ? "Prepare an editor handoff."
          : "Open job for the next action."),
    };
    items.push(item);
    addSchedule(item);
  }
  if (
    items.some(
      (i) =>
        ["prepare", "editing", "review", "deliver"].includes(i.lane) && !i.due,
    )
  )
    warnings.push(
      "Some production items have no delivery deadline. Set dates to make risk tracking reliable.",
    );
  events.sort(
    (a, b) =>
      Number(b.allDay) - Number(a.allDay) ||
      Date.parse(a.start) - Date.parse(b.start),
  );
  return {
    capturedAt: now.toISOString(),
    day,
    timezone,
    calendar,
    inbox,
    items: prioritize(items),
    events,
    conflicts: findConflicts(events),
    warnings,
  };
}
