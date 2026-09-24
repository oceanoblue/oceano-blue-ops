import type { AgentRole, OperationsSnapshot } from "./types";
export function factualBrief(role: AgentRole, s: OperationsSnapshot) {
  const list = (items: typeof s.items, empty: string) =>
    items.length
      ? items
          .slice(0, 12)
          .map(
            (i) =>
              `• ${i.title}${i.due ? ` · Due ${i.due}` : " · Deadline not set"}: ${i.next}${i.blockers.length ? ` Check: ${i.blockers.join("; ")}.` : ""}`,
          )
          .join("\n")
      : empty;
  if (role === "planner")
    return `${s.inbox ? `${s.inbox.messages.length} recent inbox preview(s). ${s.inbox.message}\n` : ""}${s.events.length} scheduled commitment(s), ${s.items.filter((i) => i.due === s.day).length} item(s) due today, ${s.items.filter((i) => i.overdue).length} overdue.\n${s.calendar.status !== "connected" ? `${s.calendar.message}\n` : ""}${s.conflicts.length ? `${s.conflicts.length} overlapping commitment(s) need review.\n` : ""}\n${list(
      s.items.filter((i) => i.overdue || i.rush || i.due === s.day),
      "No dated priorities found. Review undated production items before planning free time.",
    )}`;
  if (role === "handoff")
    return `Editor handoff checklist\n\n${list(
      s.items.filter((i) => i.lane === "prepare"),
      "No items are currently flagged for handoff.",
    )}\n\nFor each handoff: confirm the editor, media access, editing instructions, aspect ratios, references, deadline, and return location. A prepared export is not proof of receipt.`;
  return `Delivery watch\n\n${list(
    s.items.filter((i) => i.overdue || ["review", "deliver"].includes(i.lane)),
    "No overdue jobs or deliveries awaiting review were found.",
  )}\n\n${s.items.filter((i) => !i.due && i.lane !== "other").length} production item(s) have no deadline. ${s.warnings.join(" ")}`;
}
