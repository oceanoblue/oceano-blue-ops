"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mail,
  Workflow,
  FileText,
  Clock,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  RefreshCw,
  Eye,
  Send,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Editor, Label, type Save } from "./editors";
import { SmartFileDocument } from "./SmartFileDocument";
import {
  fileTemplateSchema,
  mergeText,
  variables,
  type AcquisitionData,
  type MessageTemplate,
  type FileTemplate,
  type FileDocument,
  type Sequence,
  type FileContext,
  type IssuedFile,
} from "@/lib/crm/acquisition-types";
import { fmtDateTime } from "@/lib/utils/format";
const sample: FileContext = {
  first_name: "Alex",
  client_name: "Alex Morgan",
  project_name: "Brand photography project",
  project_type: "Photography",
};
type Modal =
  | { kind: "message"; item?: MessageTemplate }
  | { kind: "file"; item?: FileTemplate }
  | { kind: "sequence"; item?: Sequence }
  | { kind: "send" }
  | { kind: "issued"; item: IssuedFile }
  | null;
const sections = [
  { id: "sequences", label: "Workflows", icon: Workflow },
  { id: "messages", label: "Reply templates", icon: Mail },
  { id: "files", label: "Smart files", icon: FileText },
  { id: "outbox", label: "Outbox", icon: Clock },
] as const;
type Section = (typeof sections)[number]["id"];
export function AcquisitionWorkspace({
  initialData,
  contactId,
}: {
  initialData: AcquisitionData | null;
  contactId?: string;
}) {
  const [data, setData] = useState(initialData),
    [tab, setTab] = useState<Section>(contactId ? "files" : "sequences"),
    [modal, setModal] = useState<Modal>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState<string | null>(null);
  const pending = useRef(false);
  const readRequest = useRef<AbortController | null>(null);
  const selectedSection = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selectedSection.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [tab]);
  const load = useCallback(async () => {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (contactId) params.set("contact", contactId);
      const r = await fetch(`/api/crm/acquisition?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (controller.signal.aborted) return;
      setData(body);
      setError("");
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Unable to load acquisition.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [contactId]);
  const cancelRead = useCallback(() => readRequest.current?.abort(), []);
  useEffect(() => cancelRead, [cancelRead]);
  useEffect(() => {
    if (!initialData) void load();
  }, [initialData, load]);
  const save: Save = async (action) => {
    if (pending.current) throw new Error("A request is already saving.");
    pending.current = true;
    try {
      const r = await fetch("/api/crm/acquisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setModal(null);
      setNotice(
        action.action === "issue_file"
          ? "File issued and email queued. The outbox records provider acceptance."
          : "Saved.",
      );
      await load();
    } finally {
      pending.current = false;
    }
  };
  const act = async (action: Record<string, unknown>) => {
    try {
      await save(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acquisition"
        title="From inquiry to next steps"
        subtitle="Reply with care. Follow through on time. Keep every client file connected."
        icon={Workflow}
      >
        <button
          aria-label="Refresh acquisition workspace"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-sm text-ocean-700 hover:underline"
          href="/dashboard/crm"
        >
          ← CRM & inquiries
        </Link>
        <p className="text-xs text-slate-500">
          {data?.email.configured
            ? `Email configured · replies go to ${data.email.replyTo}`
            : "Email delivery needs configuration"}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
          <button onClick={() => void load()} className="ml-3 underline">
            Retry
          </button>
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {data && !data.email.sendingEnabled && (
        <p className="rounded-xl bg-ocean-50 p-4 text-sm text-ocean-900">
          This preview is read-only. Open production Ops to edit templates,
          enable workflows, or send client files.
        </p>
      )}
      <nav
        aria-label="Acquisition sections"
        className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100/60 p-1.5"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            ref={tab === s.id ? selectedSection : undefined}
            aria-pressed={tab === s.id}
            onClick={() => setTab(s.id)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium ${tab === s.id ? "bg-white text-ink-950 shadow-soft" : "text-slate-600 hover:bg-white/60"}`}
          >
            <s.icon className="h-4 w-4" />
            {s.label}
            {s.id === "outbox" &&
              !!data?.jobs.filter((j) => j.status === "needs_approval")
                .length && (
                <span className="rounded-full bg-ocean-100 px-2 py-0.5 text-xs text-ocean-800">
                  {
                    data.jobs.filter((j) => j.status === "needs_approval")
                      .length
                  }
                </span>
              )}
          </button>
        ))}
      </nav>
      {!data ? (
        <p className="text-slate-500">
          {busy ? "Loading acquisition…" : "Acquisition is unavailable."}
        </p>
      ) : (
        <>
          {tab === "sequences" && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl text-ink-950">
                    Every inquiry has a next step
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    Choose a contact form, a reply, and a follow-up schedule.
                    Workflows enroll future inquiries only. Business days count
                    Monday through Friday in your selected timezone.
                  </p>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => setModal({ kind: "sequence" })}
                >
                  <Plus className="h-4 w-4" />
                  New workflow
                </button>
              </div>
              {data.sequences.map((s) => (
                <article key={s.id} className="card p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p
                        className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                      >
                        {s.enabled ? "Enabled" : "Paused"}
                      </p>
                      <h3 className="font-semibold text-ink-950">{s.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {data.forms.find((f) => f.id === s.form_id)?.name} ·{" "}
                        {s.timezone}
                      </p>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => setModal({ kind: "sequence", item: s })}
                    >
                      Configure workflow
                    </button>
                  </div>
                  <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {s.steps.map((step, i) => (
                      <li
                        key={step.id}
                        className="rounded-xl border border-ink-100 bg-ink-50/50 p-4"
                      >
                        <span className="text-xs text-slate-500">
                          {i + 1}.{" "}
                          {step.delay
                            ? `${step.delay} ${step.unit === "hours" ? "hours" : "business days"} after inquiry`
                            : "Immediately"}
                        </span>
                        <p className="mt-2 text-sm font-medium text-ink-900">
                          {step.kind === "task"
                            ? step.task_title
                            : data.messages.find(
                                (m) => m.id === step.message_template_id,
                              )?.name || "Email template"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {step.kind === "task"
                            ? "Office follow-up task"
                            : step.requires_approval
                              ? "Office approval before sending"
                              : "Automatic email"}
                          {step.file_template_id
                            ? " · Includes a smart file"
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
              <div className="rounded-xl border border-ocean-100 bg-ocean-50/50 p-5 text-sm leading-relaxed text-ocean-900">
                <p className="font-medium">
                  A response should end a follow-up sequence.
                </p>
                <p className="mt-2">
                  Smart-file responses stop scheduled messages automatically.
                  Email replies arrive in your office inbox; use “Client replied
                  / stop follow-ups” for that project in the outbox. Archiving a
                  project, moving it out of the open pipeline, or pausing a
                  workflow also stops queued emails. An email already handed to
                  the provider may finish sending.
                </p>
              </div>
            </section>
          )}
          {tab === "messages" && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl text-ink-950">
                    Replies that sound like your team
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">
                    Write an acknowledgment, follow-up, or introduction to a
                    client file. Review the preview, then mark the template
                    ready.
                  </p>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => setModal({ kind: "message" })}
                >
                  <Plus className="h-4 w-4" />
                  New reply template
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.messages.map((m) => (
                  <article key={m.id} className="card p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          {m.ready ? "Ready for use" : "Draft"} · Version{" "}
                          {m.version}
                        </p>
                        <h3 className="mt-2 font-semibold text-ink-950">
                          {m.name}
                        </h3>
                      </div>
                      <button
                        className="btn-secondary"
                        onClick={() => setModal({ kind: "message", item: m })}
                      >
                        Edit reply
                      </button>
                    </div>
                    <p className="mt-5 text-sm font-medium text-ink-900">
                      {m.subject}
                    </p>
                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
                      {m.body}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
          {tab === "files" && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl text-ink-950">
                    A thoughtful client handoff
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    Create branded brochures, project briefs, questionnaires,
                    and links to existing quotes or invoices. Each issued file
                    keeps its own version and response history.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => setModal({ kind: "send" })}
                  >
                    <Send className="h-4 w-4" />
                    Send a file
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => setModal({ kind: "file" })}
                  >
                    <Plus className="h-4 w-4" />
                    New smart file
                  </button>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.files.map((f) => (
                  <article key={f.id} className="card p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-xl bg-ocean-50 p-3 text-ocean-700">
                        <FileText className="h-5 w-5" />
                      </div>
                      <span className="text-xs text-slate-500">
                        {f.ready ? "Ready for use" : "Draft"} · v{f.version}
                      </span>
                    </div>
                    <h3 className="mt-4 font-semibold text-ink-950">
                      {f.name}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {f.blocks.length} blocks ·{" "}
                      {f.blocks.filter((b) => b.kind === "question").length}{" "}
                      {f.blocks.filter((b) => b.kind === "question").length ===
                      1
                        ? "question"
                        : "questions"}
                    </p>
                    <button
                      className="btn-secondary mt-5"
                      onClick={() => setModal({ kind: "file", item: f })}
                    >
                      <Eye className="h-4 w-4" />
                      Edit & preview
                    </button>
                  </article>
                ))}
              </div>
              <div className="space-y-3 border-t border-ink-100 pt-6">
                <h3 className="font-semibold">Issued files</h3>
                {!data.issued.length ? (
                  <p className="card p-6 text-sm text-slate-500">
                    Files you send will appear here with view and response
                    activity.
                  </p>
                ) : (
                  data.issued.map((f) => (
                    <article
                      className="card flex flex-wrap items-center justify-between gap-4 p-5"
                      key={f.id}
                    >
                      <div>
                        <h4 className="font-medium text-ink-950">{f.title}</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          {f.revoked_at
                            ? "Revoked"
                            : Date.parse(f.expires_at) < Date.now()
                              ? "Expired"
                              : f.responded_at
                                ? "Response received"
                                : f.viewed_at
                                  ? "Page viewed"
                                  : "Not yet viewed"}{" "}
                          · Issued {fmtDateTime(f.created_at)}
                        </p>
                      </div>
                      <button
                        className="btn-secondary"
                        onClick={() => setModal({ kind: "issued", item: f })}
                      >
                        View file & response
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}
          {tab === "outbox" && (
            <section className="space-y-5">
              <div>
                <h2 className="text-2xl text-ink-950">
                  Every send, accounted for
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Review draft emails, cancel scheduled messages, and check
                  provider acceptance. Accepted means the provider took the
                  email; inbox delivery and replies are checked in the provider
                  and office inbox.
                </p>
              </div>
              {!data.jobs.length ? (
                <div className="card p-12 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-ocean-600" />
                  <h3 className="mt-4 font-semibold text-ink-950">
                    Your outbox is clear
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Future workflow emails and issued files will appear here.
                  </p>
                </div>
              ) : (
                data.jobs.map((j) => (
                  <article key={j.id} className="card p-5 sm:p-6">
                    <div className="flex flex-wrap justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium capitalize text-ocean-700">
                          {j.status.replaceAll("_", " ")}
                        </p>
                        <h3 className="mt-2 font-semibold text-ink-950">
                          {mergeText(j.subject, j.context)}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          To {j.recipient} · Scheduled {fmtDateTime(j.due_at)}
                        </p>
                        {j.last_error && (
                          <p className="mt-3 text-sm text-rose-700">
                            {j.last_error}
                          </p>
                        )}
                      </div>
                      <button
                        className="btn-secondary"
                        aria-expanded={expanded === j.id}
                        onClick={() =>
                          setExpanded(expanded === j.id ? null : j.id)
                        }
                      >
                        Review email
                      </button>
                    </div>
                    {expanded === j.id && (
                      <div className="mt-5 space-y-4 border-t border-ink-100 pt-5">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                          {mergeText(j.body, j.context)}
                        </p>
                        {j.file_id && (
                          <p className="text-sm text-ocean-700">
                            Includes a private client-file link.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {j.status === "blocked" && !j.first_attempt_at && (
                            <button
                              className="btn-secondary"
                              disabled={!data.email.sendingEnabled}
                              onClick={() =>
                                void act({
                                  action: "job_retry",
                                  id: j.id,
                                  data: {},
                                })
                              }
                            >
                              Retry unsent email
                            </button>
                          )}
                          {j.status === "needs_approval" && (
                            <button
                              disabled={!data.email.sendingEnabled}
                              className="btn-primary"
                              onClick={() =>
                                void act({
                                  action: "job_approve",
                                  id: j.id,
                                  data: {},
                                })
                              }
                            >
                              Approve & queue email
                            </button>
                          )}
                          {[
                            "needs_approval",
                            "queued",
                            "leased",
                            "blocked",
                            "needs_review",
                          ].includes(j.status) && (
                            <button
                              className="btn-secondary"
                              onClick={() =>
                                void act({
                                  action: "job_cancel",
                                  id: j.id,
                                  data: {},
                                })
                              }
                            >
                              Cancel this email
                            </button>
                          )}
                          <button
                            className="btn-secondary"
                            onClick={() =>
                              void act({
                                action: "project_pause",
                                id: j.project_id,
                                data: {
                                  reason:
                                    "Client replied / office stopped follow-ups.",
                                },
                              })
                            }
                          >
                            Client replied / stop follow-ups
                          </button>
                        </div>
                        {j.provider_id && (
                          <p className="font-mono text-xs text-slate-500">
                            Provider reference: {j.provider_id}
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                ))
              )}
              <p className="text-xs text-slate-500">
                Showing the latest 100 emails and files. Existing HoneyBook
                history is never enrolled.
              </p>
            </section>
          )}
          {modal && (
            <Editor
              title={
                modal.kind === "message"
                  ? "Reply template"
                  : modal.kind === "file"
                    ? "Smart-file builder"
                    : modal.kind === "sequence"
                      ? "Inquiry workflow"
                      : modal.kind === "send"
                        ? "Send a client file"
                        : "Issued client file"
              }
              close={() => setModal(null)}
            >
              {modal.kind === "message" ? (
                <MessageEditor item={modal.item} save={save} />
              ) : modal.kind === "file" ? (
                <FileEditor item={modal.item} save={save} />
              ) : modal.kind === "sequence" ? (
                <SequenceEditor item={modal.item} data={data} save={save} />
              ) : modal.kind === "send" ? (
                <IssueFileEditor
                  data={data}
                  save={save}
                  contactId={contactId}
                />
              ) : (
                <IssuedFileViewer item={modal.item} save={save} />
              )}
            </Editor>
          )}
        </>
      )}
    </div>
  );
}
function useEditorSave(save: Save) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return {
    busy,
    error,
    submit: async (action: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      try {
        await save(action);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to save.");
      } finally {
        setBusy(false);
      }
    },
  };
}
function Feedback({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
      {error}
    </p>
  ) : null;
}
function MessageEditor({ item, save }: { item?: MessageTemplate; save: Save }) {
  const [id] = useState(() => item?.id ?? crypto.randomUUID()),
    [subject, setSubject] = useState(
      item?.subject ?? "Thank you for reaching out · Oceano Blue",
    ),
    [body, setBody] = useState(
      item?.body ??
        "Hi {{first_name}},\n\nThank you for your inquiry. Our team will review your project details and get in touch about the next steps.\n\nThe Oceano Blue team",
    );
  const { busy, error, submit } = useEditorSave(save);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit({
          action: "message_template_save",
          id,
          version: item?.version ?? 0,
          data: {
            name: f.get("name"),
            subject,
            body,
            ready: f.get("ready") === "on",
          },
        });
      }}
    >
      <Label name="Internal template name">
        <input
          className="input"
          name="name"
          required
          maxLength={120}
          defaultValue={item?.name}
        />
      </Label>
      <Label name="Subject">
        <input
          className="input"
          required
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </Label>
      <Label name="Message">
        <textarea
          className="input"
          rows={10}
          required
          maxLength={10000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Label>
      <p className="text-xs leading-relaxed text-slate-500">
        Personalize with {variables.map((v) => `{{${v}}}`).join(", ")}. A
        selected smart file is added as a button below the message.
      </p>
      <div className="rounded-xl border border-ink-100 bg-ink-50 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ocean-700">
          Sample preview
        </p>
        <p className="mt-3 font-semibold">{mergeText(subject, sample)}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {mergeText(body, sample)}
        </p>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="ready" defaultChecked={item?.ready} />
        Ready for workflows and client emails
      </label>
      <p className="text-xs text-slate-500">
        Returning this template to draft pauses workflows that use it.
      </p>
      <Feedback error={error} />
      <button disabled={busy} className="btn-primary">
        {busy ? "Saving…" : "Save reply template"}
      </button>
    </form>
  );
}
function FileEditor({ item, save }: { item?: FileTemplate; save: Save }) {
  const [id] = useState(() => item?.id ?? crypto.randomUUID()),
    [name, setName] = useState(item?.name ?? ""),
    [title, setTitle] = useState(item?.title ?? "Your next project"),
    [description, setDescription] = useState(item?.description ?? ""),
    [blocks, setBlocks] = useState<FileDocument["blocks"]>(
      item?.blocks ?? [
        {
          id: crypto.randomUUID(),
          kind: "text",
          title: "Welcome",
          body: "Hi {{first_name}}, here are the next steps for {{project_name}}.",
        },
      ],
    ),
    [preview, setPreview] = useState(false);
  const { busy, error, submit } = useEditorSave(save);
  const doc = {
    name: name || "Preview",
    title,
    description,
    blocks,
    ready: false,
  };
  function patch(i: number, change: Partial<FileDocument["blocks"][number]>) {
    setBlocks((old) =>
      old.map((b, n) =>
        n === i ? ({ ...b, ...change } as FileDocument["blocks"][number]) : b,
      ),
    );
  }
  function move(i: number, d: number) {
    setBlocks((old) => {
      const rows = [...old];
      [rows[i], rows[i + d]] = [rows[i + d], rows[i]];
      return rows;
    });
  }
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit({
          action: "file_template_save",
          id,
          version: item?.version ?? 0,
          data: {
            name,
            title,
            description,
            blocks,
            ready: f.get("ready") === "on",
          },
        });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Text, secure document links, and client questions.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Back to editor" : "Preview file"}
        </button>
      </div>
      {preview ? (
        <div className="rounded-xl border border-ink-100 p-5">
          <SmartFileDocument document={doc} context={sample} disabled />
        </div>
      ) : (
        <>
          <Label name="Internal template name">
            <input
              className="input"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Label>
          <Label name="Client-facing title">
            <input
              className="input"
              required
              maxLength={180}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Label>
          <Label name="Introduction">
            <textarea
              className="input"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Label>
          <div className="space-y-4">
            {blocks.map((b, i) => (
              <section
                key={b.id}
                className="space-y-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {i + 1} · {b.kind}
                  </p>
                  <div className="flex gap-1">
                    <button
                      className="btn-ghost"
                      type="button"
                      aria-label={`Move block ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      className="btn-ghost"
                      type="button"
                      aria-label={`Move block ${i + 1} down`}
                      disabled={i === blocks.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      className="btn-ghost"
                      type="button"
                      aria-label={`Remove block ${i + 1}`}
                      disabled={blocks.length === 1}
                      onClick={() =>
                        setBlocks((old) => old.filter((_, n) => n !== i))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {b.kind === "question" ? (
                  <>
                    <Label name="Question label">
                      <input
                        className="input"
                        required
                        maxLength={150}
                        value={b.field.label}
                        onChange={(e) =>
                          patch(i, {
                            field: { ...b.field, label: e.target.value },
                          })
                        }
                      />
                    </Label>
                    <Label name="Answer type">
                      <select
                        className="input"
                        value={b.field.type}
                        onChange={(e) =>
                          patch(i, {
                            field: {
                              ...b.field,
                              type: e.target.value as typeof b.field.type,
                            },
                          })
                        }
                      >
                        {[
                          "text",
                          "textarea",
                          "email",
                          "tel",
                          "date",
                          "number",
                          "select",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </Label>
                    {b.field.type === "select" && (
                      <Label name="Options (one per line)">
                        <textarea
                          className="input"
                          value={b.field.options?.join("\n") ?? ""}
                          onChange={(e) =>
                            patch(i, {
                              field: {
                                ...b.field,
                                options: e.target.value.split("\n"),
                              },
                            })
                          }
                        />
                      </Label>
                    )}
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={b.field.required}
                        onChange={(e) =>
                          patch(i, {
                            field: { ...b.field, required: e.target.checked },
                          })
                        }
                      />
                      Required question
                    </label>
                  </>
                ) : (
                  <>
                    <Label
                      name={
                        b.kind === "text" ? "Section heading" : "Document title"
                      }
                    >
                      <input
                        className="input"
                        maxLength={180}
                        required={b.kind === "link"}
                        value={b.title}
                        onChange={(e) => patch(i, { title: e.target.value })}
                      />
                    </Label>
                    {b.kind === "link" && (
                      <Label name="Secure document URL">
                        <input
                          className="input"
                          type="url"
                          required
                          placeholder="https://…"
                          value={b.url}
                          onChange={(e) => patch(i, { url: e.target.value })}
                        />
                      </Label>
                    )}
                    <Label name={b.kind === "text" ? "Content" : "Description"}>
                      <textarea
                        className="input"
                        rows={4}
                        maxLength={b.kind === "text" ? 10000 : 1000}
                        value={b.body}
                        onChange={(e) => patch(i, { body: e.target.value })}
                      />
                    </Label>
                  </>
                )}
              </section>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["text", "link", "question"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className="btn-secondary"
                disabled={blocks.length >= 40}
                onClick={() =>
                  setBlocks((old) => [
                    ...old,
                    kind === "text"
                      ? { id: crypto.randomUUID(), kind, title: "", body: "" }
                      : kind === "link"
                        ? {
                            id: crypto.randomUUID(),
                            kind,
                            title: "",
                            url: "",
                            body: "",
                          }
                        : {
                            id: crypto.randomUUID(),
                            kind,
                            field: {
                              key: `question_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                              label: "New question",
                              type: "textarea",
                              required: false,
                            },
                          },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                Add {kind}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input name="ready" type="checkbox" defaultChecked={item?.ready} />
        Ready for client use
      </label>
      <p className="text-xs text-slate-500">
        Changes apply to future files. Already issued copies and their responses
        are preserved. Returning this template to draft pauses workflows that
        use it.
      </p>
      <Feedback error={error} />
      <button className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save smart-file template"}
      </button>
    </form>
  );
}
function SequenceEditor({
  item,
  data,
  save,
}: {
  item?: Sequence;
  data: AcquisitionData;
  save: Save;
}) {
  const [id] = useState(() => item?.id ?? crypto.randomUUID()),
    [steps, setSteps] = useState<Sequence["steps"]>(
      item?.steps ?? [
        {
          id: crypto.randomUUID(),
          kind: "email",
          delay: 0,
          unit: "hours",
          message_template_id: data.messages[0]?.id ?? null,
          file_template_id: null,
          task_title: "",
          requires_approval: true,
        },
      ],
    );
  const { busy, error, submit } = useEditorSave(save);
  const patch = (i: number, p: Partial<Sequence["steps"][number]>) =>
    setSteps((old) => old.map((s, n) => (n === i ? { ...s, ...p } : s)));
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit({
          action: "sequence_save",
          id,
          version: item?.version ?? 0,
          data: {
            name: f.get("name"),
            form_id: f.get("form_id"),
            timezone: f.get("timezone"),
            enabled: f.get("enabled") === "on",
            steps,
          },
        });
      }}
    >
      <Label name="Workflow name">
        <input
          className="input"
          name="name"
          required
          maxLength={120}
          defaultValue={item?.name}
        />
      </Label>
      <Label name="Contact form">
        <select
          className="input"
          name="form_id"
          required
          defaultValue={item?.form_id ?? data.forms[0]?.id}
        >
          {data.forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {!f.published ? " (draft)" : ""}
            </option>
          ))}
        </select>
      </Label>
      <Label name="Business timezone">
        <input
          className="input"
          name="timezone"
          defaultValue={item?.timezone ?? "America/New_York"}
          required
          maxLength={80}
        />
      </Label>
      <div className="space-y-4">
        {steps.map((s, i) => (
          <section
            key={s.id}
            className="space-y-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Step {i + 1}</h3>
              <button
                type="button"
                className="btn-ghost"
                disabled={steps.length === 1}
                onClick={() => setSteps((old) => old.filter((_, n) => n !== i))}
              >
                Remove
              </button>
            </div>
            <Label name="Action">
              <select
                className="input"
                value={s.kind}
                onChange={(e) =>
                  patch(i, {
                    kind: e.target.value as "email" | "task",
                    task_title: s.task_title || "Follow up on this inquiry",
                  })
                }
              >
                <option value="email">Send email</option>
                <option value="task">Create an office follow-up task</option>
              </select>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Label name="Delay after inquiry">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={365}
                  value={s.delay}
                  onChange={(e) => patch(i, { delay: Number(e.target.value) })}
                />
              </Label>
              <Label name="Delay unit">
                <select
                  className="input"
                  value={s.unit}
                  onChange={(e) =>
                    patch(i, {
                      unit: e.target.value as "hours" | "business_days",
                    })
                  }
                >
                  <option value="hours">Hours</option>
                  <option value="business_days">Business days</option>
                </select>
              </Label>
            </div>
            {s.kind === "task" ? (
              <Label name="Follow-up task">
                <input
                  className="input"
                  required
                  maxLength={180}
                  value={s.task_title}
                  onChange={(e) => patch(i, { task_title: e.target.value })}
                />
              </Label>
            ) : (
              <>
                <Label name="Reply template">
                  <select
                    className="input"
                    required
                    value={s.message_template_id ?? ""}
                    onChange={(e) =>
                      patch(i, { message_template_id: e.target.value || null })
                    }
                  >
                    <option value="">Choose a template</option>
                    {data.messages.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {!m.ready ? " (draft)" : ""}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label name="Include a smart file">
                  <select
                    className="input"
                    value={s.file_template_id ?? ""}
                    onChange={(e) =>
                      patch(i, { file_template_id: e.target.value || null })
                    }
                  >
                    <option value="">No file</option>
                    {data.files.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {!f.ready ? " (draft)" : ""}
                      </option>
                    ))}
                  </select>
                </Label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={s.requires_approval}
                    onChange={(e) =>
                      patch(i, { requires_approval: e.target.checked })
                    }
                  />
                  Office approval required before sending
                </label>
              </>
            )}
          </section>
        ))}
      </div>
      <button
        type="button"
        className="btn-secondary"
        disabled={steps.length >= 12}
        onClick={() =>
          setSteps((old) => [
            ...old,
            {
              id: crypto.randomUUID(),
              kind: "task",
              delay: 2,
              unit: "business_days",
              task_title: "Follow up on this inquiry",
              message_template_id: null,
              file_template_id: null,
              requires_approval: true,
            },
          ])
        }
      >
        <Plus className="h-4 w-4" />
        Add step
      </button>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={item?.enabled}
          disabled={
            (!data.email.configured || !data.email.sendingEnabled) &&
            steps.some((s) => s.kind === "email")
          }
        />
        Enable for future inquiries
      </label>
      <p className="text-xs leading-relaxed text-slate-500">
        Email and smart-file templates must be ready before enabling. Task steps
        appear in CRM immediately with their scheduled due date. Pausing cancels
        queued emails; re-enabling does not restart those runs. Business days
        exclude weekends and preserve local time across daylight-saving changes.
      </p>
      <Feedback error={error} />
      <button disabled={busy} className="btn-primary">
        {busy ? "Saving…" : "Save workflow"}
      </button>
    </form>
  );
}
function IssueFileEditor({
  data,
  save,
  contactId,
}: {
  data: AcquisitionData;
  save: Save;
  contactId?: string;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    [projects, setProjects] = useState(data.projects),
    [query, setQuery] = useState(""),
    [projectId, setProjectId] = useState(""),
    [messageId, setMessageId] = useState(""),
    [fileId, setFileId] = useState(""),
    [searchError, setSearchError] = useState("");
  const { busy, error, submit } = useEditorSave(save);
  useEffect(() => {
    if (!query) {
      setProjects(data.projects);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ q: query, projects_only: "1" });
      if (contactId) p.set("contact", contactId);
      void fetch(`/api/crm/acquisition?${p}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body.error);
          if (!controller.signal.aborted) {
            setProjects(body.projects);
            setSearchError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setSearchError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, contactId, data.projects]);
  const project = projects.find((p) => p.id === projectId),
    message = data.messages.find((m) => m.id === messageId),
    file = data.files.find((f) => f.id === fileId);
  const context: FileContext = project
    ? {
        first_name: project.clients?.full_name.split(" ")[0] ?? "",
        client_name: project.clients?.full_name ?? "",
        project_name: project.title,
        project_type: project.project_type ?? "",
      }
    : sample;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit({
          action: "issue_file",
          id,
          data: {
            project_id: projectId,
            message_template_id: messageId,
            file_template_id: fileId,
          },
        });
      }}
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Issue a fixed copy of a ready template and email its private link to the
        project’s contact. Review the recipient, message, and file below before
        sending.
      </p>
      <Label name="Find an open project by name">
        <input
          className="input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setProjectId("");
          }}
          placeholder="Project name…"
          maxLength={120}
        />
      </Label>
      <Label name="Project & recipient">
        <select
          className="input"
          name="project_id"
          value={projectId}
          required
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Choose an open project</option>
          {projects
            .filter((p) => p.crm_stages?.outcome === "open")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {p.clients?.full_name} · {p.clients?.email}
              </option>
            ))}
        </select>
      </Label>
      <Label name="Smart-file template">
        <select
          className="input"
          name="file_template_id"
          required
          value={fileId}
          onChange={(e) => setFileId(e.target.value)}
        >
          <option value="">Choose a ready file</option>
          {data.files
            .filter((f) => f.ready)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </Label>
      <Label name="Accompanying email">
        <select
          className="input"
          name="message_template_id"
          required
          value={messageId}
          onChange={(e) => setMessageId(e.target.value)}
        >
          <option value="">Choose a ready reply</option>
          {data.messages
            .filter((m) => m.ready)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Label>
      {project && message && file && (
        <section className="space-y-5 rounded-xl border border-ink-100 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ocean-700">
            Send preview
          </p>
          <div className="space-y-3 border-b border-ink-100 pb-5">
            <p className="text-sm text-slate-500">
              To {project.clients?.full_name} · {project.clients?.email}
            </p>
            <p className="font-semibold">
              {mergeText(message.subject, context)}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {mergeText(message.body, context)}
            </p>
            <p className="text-xs text-ocean-700">
              The email includes an “Open your project file” button.
            </p>
          </div>
          <SmartFileDocument document={file} context={context} disabled />
        </section>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        From {data.email.from} · Replies to {data.email.replyTo}. The client
        file link expires in 30 days and can be revoked from the issued-file
        list.
      </p>
      <Feedback error={error || searchError} />
      <button
        className="btn-primary"
        disabled={
          busy ||
          !data.email.configured ||
          !data.email.sendingEnabled ||
          !project ||
          !message ||
          !file
        }
      >
        <Send className="h-4 w-4" />
        {busy ? "Issuing file…" : "Send file by email"}
      </button>
    </form>
  );
}
function IssuedFileViewer({ item, save }: { item: IssuedFile; save: Save }) {
  const [details, setDetails] = useState<{
      snapshot: FileDocument;
      context: FileContext;
      url: string | null;
      crm_file_responses: {
        answers: Record<string, string>;
        created_at: string;
      }[];
    } | null>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const editor = useEditorSave(save);
  useEffect(() => {
    let active = true;
    void fetch(`/api/crm/acquisition/files/${item.id}`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        const parsed = fileTemplateSchema.parse(b.snapshot);
        if (active) setDetails({ ...b, snapshot: parsed });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [item.id]);
  if (!details)
    return (
      <p role={error ? "alert" : undefined}>
        {error || "Loading issued file…"}
      </p>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {details.url && (
          <>
            <a
              className="btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
              href={details.url}
            >
              Open client view ↗
            </a>
            <button
              className="btn-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(details.url!);
                  setCopied(true);
                } catch {
                  setError(
                    "Copy was unavailable. Open the client view to copy its link.",
                  );
                }
              }}
            >
              {copied ? "Copied" : "Copy private link"}
            </button>
            <button
              className="btn-secondary"
              disabled={editor.busy}
              onClick={() =>
                void editor.submit({
                  action: "file_revoke",
                  id: item.id,
                  data: {},
                })
              }
            >
              Revoke link
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Expires {fmtDateTime(item.expires_at)} · Revoking the link preserves its
        history.
      </p>
      <Feedback error={error || editor.error} />
      <div className="rounded-xl border border-ink-100 p-5">
        <SmartFileDocument
          document={details.snapshot}
          context={details.context}
          answers={details.crm_file_responses[0]?.answers}
          disabled
        />
      </div>
      {details.crm_file_responses[0] && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          Response received{" "}
          {fmtDateTime(details.crm_file_responses[0].created_at)}. Scheduled
          follow-ups for this project have stopped.
        </p>
      )}
    </div>
  );
}
