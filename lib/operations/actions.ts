import type { EmailDraft, WorkItem } from "./types";

export function workAction(item: WorkItem) {
  const stage = item.lane === "deliver" ? "delivery" : item.lane === "review" ? "review" : "upload";
  const label = item.lane === "deliver" ? "Preview & send delivery" : item.lane === "review" ? "Review media" : "Open editing workspace";
  return { label, href: item.kind === "order" ? `${item.href}#${stage}` : `${item.href}?tab=${stage === "upload" ? "assets" : stage}` };
}

export function handoffDraft(item: WorkItem): EmailDraft {
  return { to: "", subject: `Editing handoff · ${item.title}`.slice(0,250), body:
    `Hi ${item.editor || "[editor name]"},\n\nPlease review the editing handoff for ${item.title}.\n\nClient: ${item.client}\nDeadline: ${item.due || "[confirm deadline and timezone]"}\nEditing requirements: [add the creative brief, formats and references]\nSource media: [add an editor-accessible link]\nReturn location: [add the delivery folder]\n\n${item.blockers.length ? `Before starting, please confirm: ${item.blockers.join("; ")}.\n\n` : ""}Please confirm you can access the media and meet the deadline.\n\nThank you,\nOceano Blue Media` };
}

export function editorDraft(item: WorkItem): EmailDraft {
  if (item.lane === "prepare") return handoffDraft(item);
  return { to: "", subject: `Editing update · ${item.title}`.slice(0,250), body: `Hi ${item.editor || "[editor name]"},\n\nCould you share an update on ${item.title}?\n\n${item.due ? `The recorded deadline is ${item.due}.` : "Please confirm the expected completion date."}\n\nPlease let us know if you need anything from us to complete the work.\n\nThank you,\nOceano Blue Media` };
}
