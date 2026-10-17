"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users,
  Search,
  Plus,
  ArrowRight,
  RefreshCw,
  FileInput,
  ClipboardList,
  Globe,
  Workflow,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  Automation,
  CrmContact,
  CrmData,
  CrmForm,
  Deal,
  Stage,
  Task,
  CrmEvent,
} from "@/lib/crm/types";
import { toCsv } from "@/lib/crm/csv";
import {
  Editor,
  ContactEditor,
  DealEditor,
  FormEditor,
  ImportEditor,
  StageEditor,
  AutomationEditor,
  Label,
  type Save,
} from "./editors";
const money = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v / 100);
const date = (v: string | null) => (v ? new Date(v).toLocaleString() : "");
type Modal =
  | { kind: "contact"; contact?: CrmContact }
  | { kind: "deal"; deal?: Deal; clientId?: string }
  | { kind: "form"; form?: CrmForm }
  | { kind: "import" }
  | { kind: "stage"; stage?: Stage }
  | { kind: "automation"; automation?: Automation }
  | null;
type ContactDetail = {
  contact: CrmContact;
  deals: Deal[];
  events: CrmEvent[];
  submissions: {
    id: string;
    answers: Record<string, string>;
    form_snapshot: { title: string; fields: { key: string; label: string }[] };
    created_at: string;
    attribution: Record<string, string>;
  }[];
  tasks: Task[];
  orders: {
    id: string;
    order_number: number;
    status: string;
    total_cents: number;
    download_paid_at: string | null;
  }[];
  jobs: { id: string; title: string; status: string }[];
};
const tabs = [
  { key: "pipeline", label: "Pipeline", icon: Users },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "tasks", label: "Follow-ups", icon: ClipboardList },
  { key: "forms", label: "Contact forms", icon: Globe },
  { key: "automations", label: "Automations", icon: Workflow },
  { key: "reports", label: "Reports", icon: BarChart3 },
] as const;
type Tab = (typeof tabs)[number]["key"];
export function CrmWorkspace() {
  const [data, setData] = useState<CrmData | null>(null),
    [tab, setTab] = useState<Tab>("pipeline"),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [stageFilter, setStageFilter] = useState(""),
    [owner, setOwner] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<Modal>(null),
    [contactId, setContactId] = useState<string | null>(null),
    [detail, setDetail] = useState<ContactDetail | null>(null),
    [detailError, setDetailError] = useState("");
  const pageRef = useRef(0),
    filtersRef = useRef({ search, tag, stageFilter, owner }),
    loadSequence = useRef(0);
  filtersRef.current = { search, tag, stageFilter, owner };
  const load = useCallback(async (page = pageRef.current) => {
    const sequence = ++loadSequence.current;
    setBusy(true);
    const f = filtersRef.current;
    const params = new URLSearchParams({
      page: String(page),
      q: f.search,
      tag: f.tag,
      stage: f.stageFilter,
      owner: f.owner,
    });
    try {
      const r = await fetch(`/api/crm?${params}`, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (sequence !== loadSequence.current) return;
      setData(body);
      pageRef.current = page;
      setError("");
    } catch (e) {
      if (sequence === loadSequence.current)
        setError(e instanceof Error ? e.message : "Unable to load CRM.");
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/crm/contacts/${id}`, { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    return b as ContactDetail;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(0), 250);
    return () => clearTimeout(timer);
  }, [load, search, tag, stageFilter, owner]);
  useEffect(() => {
    if (!contactId) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetail(null);
    setDetailError("");
    loadDetail(contactId)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setDetailError(e.message);
      });
    return () => {
      active = false;
    };
  }, [contactId, loadDetail]);
  const save: Save = async (action) => {
    const r = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    setModal(null);
    setNotice(
      action.action === "import"
        ? `${body.added} contacts imported; ${body.skipped} existing email addresses skipped.`
        : "Saved.",
    );
    await load();
    if (contactId) setDetail(await loadDetail(contactId));
  };
  async function act(action: Record<string, unknown>) {
    try {
      await save(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    }
  }
  const contacts = data?.contacts || [],
    deals = data?.deals || [],
    allTags = data?.tags || [];
  function exportContacts() {
    if (!data) return;
    const csv = toCsv([
      [
        "Full name",
        "Email",
        "Phone",
        "Address",
        "Company",
        "Tags",
        "Status",
        "Notes",
      ],
      ...contacts.map((c) => [
        c.full_name,
        c.email,
        c.phone,
        c.billing_address,
        c.crm_contact_profiles?.company || c.brokerage,
        c.crm_contact_profiles?.tags.join(";"),
        c.crm_contact_profiles?.status || "client",
        c.notes,
      ]),
    ]);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ops-contacts-page-${data.page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relationships"
        title="CRM & inquiries"
        subtitle="From your first conversation to the next project."
        icon={Users}
      >
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </PageHeader>
      <nav className="flex flex-wrap gap-2" aria-label="CRM sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setSearch("");
            }}
            aria-pressed={tab === t.key}
            className={tab === t.key ? "btn-primary" : "btn-secondary"}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
          <button onClick={() => void load()} className="ml-3 underline">
            Retry
          </button>
        </div>
      ) : null}
      {!data ? (
        <p className="text-slate-500">
          {busy ? "Loading your CRM…" : "CRM data is unavailable."}
        </p>
      ) : (
        <>
          {tab === "pipeline" || tab === "contacts" ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-48 flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <span className="sr-only">Search CRM</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search CRM…"
                  className="input w-full pl-9"
                />
              </label>
              {tab === "contacts" ? (
                <>
                  <select
                    aria-label="Filter by tag"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className="input"
                  >
                    <option value="">All tags</option>
                    {allTags.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <button onClick={exportContacts} className="btn-secondary">
                    Export this page
                  </button>
                  <button
                    onClick={() => setModal({ kind: "import" })}
                    className="btn-secondary"
                  >
                    <FileInput className="h-4 w-4" />
                    Import CSV
                  </button>
                </>
              ) : (
                <>
                  <select
                    aria-label="Filter by stage"
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                    className="input"
                  >
                    <option value="">All stages</option>
                    {data.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="input"
                  >
                    <option value="">All owners</option>
                    {data.team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button
                className="btn-primary"
                onClick={() =>
                  setModal({ kind: tab === "contacts" ? "contact" : "deal" })
                }
              >
                <Plus className="h-4 w-4" />
                {tab === "contacts" ? "New contact" : "New project"}
              </button>
            </div>
          ) : null}
          {tab === "pipeline" ? (
            <>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {data.stages
                  .filter((s) => !stageFilter || s.id === stageFilter)
                  .map((stage) => {
                    const rows = deals.filter((d) => d.stage_id === stage.id);
                    return (
                      <section
                        key={stage.id}
                        className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-slate-100/70 p-3"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <button
                            className="text-left font-semibold text-ocean-950"
                            onClick={() => setModal({ kind: "stage", stage })}
                          >
                            {stage.name}{" "}
                            <span className="ml-1 text-slate-400">
                              {rows.length}
                            </span>
                          </button>
                          <span className="text-xs text-slate-500">
                            {money(rows.reduce((a, d) => a + d.value_cents, 0))}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {rows.map((d) => (
                            <article
                              key={d.id}
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                              <button
                                className="text-left font-semibold text-ocean-900 hover:underline"
                                onClick={() =>
                                  setModal({ kind: "deal", deal: d })
                                }
                              >
                                {d.title}
                              </button>
                              <button
                                className="mt-1 block text-sm text-slate-600 hover:underline"
                                onClick={() => setContactId(d.client_id)}
                              >
                                {d.clients?.full_name || "Open contact"}
                              </button>
                              <p className="mt-3 text-sm font-medium">
                                {money(d.value_cents)}
                              </p>
                              {d.project_type ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {d.project_type}
                                </p>
                              ) : null}
                              {d.next_follow_up ? (
                                <p
                                  className={`mt-2 text-xs ${new Date(d.next_follow_up) < new Date() ? "text-red-700" : "text-slate-500"}`}
                                >
                                  Follow up {date(d.next_follow_up)}
                                </p>
                              ) : null}
                              <label className="mt-3 block">
                                <span className="sr-only">
                                  Stage for {d.title}
                                </span>
                                <select
                                  className="input w-full text-xs"
                                  value={d.stage_id}
                                  disabled={busy}
                                  onChange={(e) =>
                                    void act({
                                      action: "deal_update",
                                      id: d.id,
                                      version: d.version,
                                      data: { ...d, stage_id: e.target.value },
                                    })
                                  }
                                >
                                  {data.stages.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </article>
                          ))}
                          {!rows.length ? (
                            <p className="py-10 text-center text-sm text-slate-400">
                              No projects on this page
                            </p>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
              </div>
              <button
                className="btn-secondary"
                onClick={() => setModal({ kind: "stage" })}
              >
                Add pipeline stage
              </button>
            </>
          ) : null}
          {tab === "contacts" ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Company</th>
                    <th className="p-4">Relationship</th>
                    <th className="p-4">Tags</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="p-4">
                        <button
                          onClick={() => setContactId(c.id)}
                          className="font-semibold text-ocean-800 hover:underline"
                        >
                          {c.full_name}
                        </button>
                        <p className="mt-1 text-slate-500">{c.email}</p>
                      </td>
                      <td className="p-4">
                        {c.crm_contact_profiles?.company || c.brokerage || "—"}
                      </td>
                      <td className="p-4 capitalize">
                        {c.crm_contact_profiles?.status || "client"}
                      </td>
                      <td className="p-4">
                        {c.crm_contact_profiles?.tags?.join(", ") || "—"}
                      </td>
                      <td className="p-4">
                        <button
                          className="text-ocean-700 hover:underline"
                          onClick={() =>
                            setModal({ kind: "contact", contact: c })
                          }
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!contacts.length ? (
                <p className="p-8 text-center text-slate-500">
                  No contacts match. Add a contact or import your HoneyBook CSV.
                </p>
              ) : null}
            </div>
          ) : null}
          {tab === "tasks" ? (
            <TaskList
              tasks={data.tasks}
              team={data.team}
              save={save}
              onContact={setContactId}
            />
          ) : null}
          {tab === "forms" ? (
            <section className="space-y-4">
              <div className="flex justify-between gap-3">
                <p className="max-w-xl text-sm text-slate-600">
                  Embed a form on your website. Each inquiry creates a contact
                  and project directly in Ops.
                </p>
                <button
                  className="btn-primary"
                  onClick={() => setModal({ kind: "form" })}
                >
                  New contact form
                </button>
              </div>
              {data.forms.map((f) => (
                <article key={f.id} className="card p-5">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-ocean-950">{f.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {f.published ? "Accepting inquiries" : "Draft"} ·{" "}
                        {f.fields.length} questions
                      </p>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => setModal({ kind: "form", form: f })}
                    >
                      Edit form
                    </button>
                  </div>
                  <FormLinks form={f} />
                </article>
              ))}
              {!data.forms.length ? (
                <div className="card p-10 text-center">
                  <Globe className="mx-auto mb-3 h-8 w-8 text-ocean-500" />
                  <h2 className="font-semibold">
                    Bring your website inquiries home
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Create a form using the fields from your existing HoneyBook
                    inquiry form.
                  </p>
                  <button
                    className="btn-primary mt-4"
                    onClick={() => setModal({ kind: "form" })}
                  >
                    Create website form
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
          {tab === "automations" ? (
            <section className="space-y-4">
              <div className="flex justify-between">
                <p className="text-sm text-slate-600">
                  Internal task automation for new inquiries and stage changes.
                </p>
                <button
                  className="btn-primary"
                  onClick={() => setModal({ kind: "automation" })}
                >
                  New automation
                </button>
              </div>
              {data.automations.map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    setModal({ kind: "automation", automation: a })
                  }
                  className="card block w-full p-5 text-left"
                >
                  <span className="font-semibold">{a.name}</span>
                  <p className="mt-1 text-sm text-slate-500">
                    {a.enabled ? "Enabled" : "Paused"} ·{" "}
                    {a.trigger === "inquiry_received"
                      ? "Inquiry received"
                      : "Stage changed"}{" "}
                    → {a.task_title} · due in {a.delay_hours}h
                  </p>
                </button>
              ))}
              {!data.automations.length ? (
                <p className="card p-8 text-center text-slate-500">
                  Add an automation to create follow-up tasks automatically.
                </p>
              ) : null}
            </section>
          ) : null}
          {tab === "reports" ? <Reports /> : null}
          {tab === "contacts" || tab === "pipeline" ? (
            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
              <span>
                Page {data.page + 1} · up to 100 contacts and projects per page
              </span>
              <div className="flex gap-2">
                <button
                  disabled={busy || data.page === 0}
                  onClick={() => void load(data.page - 1)}
                  className="btn-secondary"
                >
                  Previous
                </button>
                <button
                  disabled={busy || !data.hasMore}
                  onClick={() => void load(data.page + 1)}
                  className="btn-secondary"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-sm text-ocean-700">
            {[
              ["Quotes", "/dashboard/quotes"],
              ["Invoices", "/dashboard/invoices"],
              ["Schedule", "/dashboard/schedule"],
              ["Production", "/dashboard/projects"],
              ["Deliveries", "/dashboard/deliveries"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-1 hover:underline"
              >
                {label}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
          {contactId && !modal ? (
            <Editor
              title={detail?.contact.full_name || "Contact workspace"}
              close={() => setContactId(null)}
            >
              {detail ? (
                <ContactPanel
                  detail={detail}
                  team={data.team}
                  save={save}
                  edit={() =>
                    setModal({ kind: "contact", contact: detail.contact })
                  }
                  newDeal={() =>
                    setModal({ kind: "deal", clientId: contactId })
                  }
                  editDeal={(deal) => setModal({ kind: "deal", deal })}
                />
              ) : (
                <p role={detailError ? "alert" : undefined}>
                  {detailError || "Loading contact history…"}
                </p>
              )}
            </Editor>
          ) : null}
          {modal ? (
            <Editor
              title={
                {
                  contact: "Contact",
                  deal: "Project",
                  form: "Contact form",
                  import: "Import contacts",
                  stage: "Pipeline stage",
                  automation: "Task automation",
                }[modal.kind]
              }
              close={() => setModal(null)}
            >
              {modal.kind === "contact" ? (
                <ContactEditor contact={modal.contact} save={save} />
              ) : modal.kind === "deal" ? (
                <DealEditor
                  deal={modal.deal}
                  data={data}
                  clientId={modal.clientId}
                  save={save}
                />
              ) : modal.kind === "form" ? (
                <FormEditor form={modal.form} team={data.team} save={save} />
              ) : modal.kind === "import" ? (
                <ImportEditor save={save} />
              ) : modal.kind === "stage" ? (
                <StageEditor stage={modal.stage} save={save} />
              ) : (
                <AutomationEditor
                  automation={modal.automation}
                  stages={data.stages}
                  save={save}
                />
              )}
            </Editor>
          ) : null}
        </>
      )}
    </div>
  );
}
function FormLinks({ form }: { form: CrmForm }) {
  const [origin, setOrigin] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/inquire/${form.slug}`,
    embed = `<iframe src="${url}" title="Oceano Blue project inquiry" style="width:100%;height:1500px;border:0" loading="lazy"></iframe>`;
  return (
    <div className="mt-4 space-y-3">
      <Link
        href={`/inquire/${form.slug}`}
        target="_blank"
        className="text-sm text-ocean-700 underline"
      >
        Open published form ↗
      </Link>
      <Label name="Website embed code">
        <textarea
          readOnly
          rows={3}
          className="input w-full font-mono text-xs"
          value={embed}
        />
      </Label>
      <button
        className="btn-secondary"
        disabled={!origin}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(embed);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy embed code"}
      </button>
      <p className="text-xs text-slate-500">
        Place this embed in your website after testing the form. The form must
        be accepting inquiries.
      </p>
    </div>
  );
}
function TaskList({
  tasks,
  team,
  save,
  onContact,
}: {
  tasks: Task[];
  team: CrmData["team"];
  save: Save;
  onContact: (id: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showDone, setShowDone] = useState(false);
  return (
    <section className="space-y-4">
      <form
        className="card flex flex-wrap gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          setBusy(true);
          try {
            await save({
              action: "task_create",
              id: crypto.randomUUID(),
              data: {
                title: f.get("title"),
                client_id: null,
                project_id: null,
                owner_id: f.get("owner_id") || null,
                due_at: f.get("due_at")
                  ? new Date(String(f.get("due_at"))).toISOString()
                  : null,
              },
            });
            form.reset();
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          name="title"
          aria-label="Task title"
          placeholder="What needs to happen next?"
          className="input min-w-56 flex-1"
          maxLength={180}
          required
        />
        <input
          name="due_at"
          aria-label="Due date in your local time"
          type="datetime-local"
          className="input"
        />
        <select name="owner_id" aria-label="Task owner" className="input">
          <option value="">Unassigned</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <button disabled={busy} className="btn-primary">
          Add task
        </button>
      </form>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showDone}
          onChange={(e) => setShowDone(e.target.checked)}
        />
        Show completed tasks
      </label>
      {tasks
        .filter((t) => showDone || !t.completed_at)
        .map((t) => (
          <article key={t.id} className="card flex items-center gap-3 p-4">
            <input
              type="checkbox"
              aria-label={`Complete ${t.title}`}
              checked={!!t.completed_at}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  await save({
                    action: "task_update",
                    id: t.id,
                    version: t.version,
                    data: { completed: e.target.checked },
                  });
                  setError("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unable to save.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <div className="min-w-0 flex-1">
              <p
                className={
                  t.completed_at ? "text-slate-400 line-through" : "font-medium"
                }
              >
                {t.title}
              </p>
              <p
                className={`mt-1 text-xs ${t.due_at && new Date(t.due_at) < new Date() && !t.completed_at ? "text-red-700" : "text-slate-500"}`}
              >
                {t.due_at ? date(t.due_at) : "No due date"} ·{" "}
                {team.find((m) => m.id === t.owner_id)?.full_name ||
                  "Unassigned"}
              </p>
            </div>
            {t.client_id ? (
              <button
                className="text-sm text-ocean-700 underline"
                onClick={() => onContact(t.client_id!)}
              >
                Contact
              </button>
            ) : null}
          </article>
        ))}
      {!tasks.length ? (
        <p className="card p-8 text-center text-slate-500">
          No follow-ups yet.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        Showing up to 300 tasks, with open tasks first.
      </p>
    </section>
  );
}
function ContactPanel({
  detail,
  team,
  save,
  edit,
  newDeal,
  editDeal,
}: {
  detail: ContactDetail;
  team: CrmData["team"];
  save: Save;
  edit: () => void;
  newDeal: () => void;
  editDeal: (d: Deal) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const c = detail.contact;
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-ocean-50 p-4">
        <a href={`mailto:${c.email}`} className="text-ocean-800 underline">
          {c.email}
        </a>
        {c.phone ? <p className="mt-1">{c.phone}</p> : null}
        <p className="mt-1 text-sm text-slate-600">
          {c.crm_contact_profiles?.company || c.brokerage}
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary" onClick={edit}>
            Edit contact
          </button>
          <button className="btn-primary" onClick={newDeal}>
            New project
          </button>
        </div>
      </div>
      {c.notes ? (
        <p className="whitespace-pre-wrap rounded-xl border p-4 text-sm text-slate-600">
          {c.notes}
        </p>
      ) : null}
      <section>
        <h3 className="mb-3 font-semibold text-ocean-950">Projects</h3>
        {detail.deals.map((d) => (
          <button
            key={d.id}
            className="mb-2 block w-full rounded-xl border border-slate-200 p-3 text-left"
            onClick={() => editDeal(d)}
          >
            <span className="font-medium">{d.title}</span>
            <span className="float-right text-sm">{money(d.value_cents)}</span>
          </button>
        ))}
        {!detail.deals.length ? (
          <p className="text-sm text-slate-500">No CRM projects yet.</p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-3 font-semibold text-ocean-950">
          Production & billing
        </h3>
        <div className="space-y-2">
          {detail.orders.map((o) => (
            <Link
              key={o.id}
              href={`/dashboard/invoices/${o.id}`}
              className="block rounded-xl border p-3 text-sm"
            >
              Order #{o.order_number} · {o.status} · {money(o.total_cents)} ·{" "}
              {o.download_paid_at ? "Payment recorded" : "Review invoice"}
            </Link>
          ))}
          {detail.jobs.map((j) => (
            <Link
              key={j.id}
              href={`/dashboard/jobs/${j.id}`}
              className="block rounded-xl border p-3 text-sm"
            >
              {j.title} · {j.status}
            </Link>
          ))}
          {!detail.orders.length && !detail.jobs.length ? (
            <p className="text-sm text-slate-500">
              No production or billing records yet.
            </p>
          ) : null}
          <Link
            href={`/dashboard/clients/${c.id}`}
            className="inline-block text-sm text-ocean-700 underline"
          >
            Client properties and profile
          </Link>
        </div>
      </section>
      <section>
        <h3 className="mb-3 font-semibold text-ocean-950">Inquiry answers</h3>
        {detail.submissions.map((s) => (
          <details key={s.id} className="mb-2 rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {s.form_snapshot.title} · {date(s.created_at)}
            </summary>
            <dl className="mt-4 space-y-3">
              {s.form_snapshot.fields.map((f) => (
                <div key={f.key}>
                  <dt className="text-xs font-medium text-slate-500">
                    {f.label}
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm">
                    {s.answers[f.key] || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
        {!detail.submissions.length ? (
          <p className="text-sm text-slate-500">No website inquiries yet.</p>
        ) : null}
      </section>
      <TaskList
        tasks={detail.tasks}
        team={team}
        save={async (action) => {
          if (action.action === "task_create")
            action = {
              ...action,
              data: { ...(action.data as object), client_id: c.id },
            };
          await save(action);
        }}
        onContact={() => {}}
      />
      <section>
        <h3 className="mb-3 font-semibold text-ocean-950">Activity & notes</h3>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            setBusy(true);
            try {
              await save({
                action: "note",
                id: crypto.randomUUID(),
                data: {
                  body: f.get("body"),
                  client_id: c.id,
                  project_id: f.get("project_id") || null,
                },
              });
              form.reset();
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to save note.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Label name="Internal note">
            <textarea
              name="body"
              className="input w-full"
              rows={3}
              required
              maxLength={10000}
            />
          </Label>
          <select
            name="project_id"
            aria-label="Attach note to project"
            className="input w-full"
          >
            <option value="">Contact note</option>
            {detail.deals.map((d) => (
              <option key={d.id} value={d.project_id}>
                {d.title}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={busy}>
            Save note
          </button>
          {error ? (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          ) : null}
        </form>
        <div className="mt-5 space-y-3">
          {detail.events.map((e) => (
            <article key={e.id} className="border-l-2 border-ocean-200 pl-3">
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {e.body}
              </p>
              <time className="text-xs text-slate-400">
                {date(e.created_at)}
              </time>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
function Reports() {
  const [data, setData] = useState<{
      stages: {
        name: string;
        count: number;
        value_cents: number;
        outcome: string;
      }[];
      sources: { name: string; count: number; value_cents: number }[];
      overdue: number;
      contacts: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/crm/reports", { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (active) setData(b);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <p role="alert" className="text-red-700">
        {error}
      </p>
    );
  if (!data) return <p>Loading reports…</p>;
  const total = data.stages.reduce((n, s) => n + s.count, 0),
    won = data.stages
      .filter((s) => s.outcome === "won")
      .reduce((n, s) => n + s.count, 0);
  return (
    <section className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Contacts", String(data.contacts)],
          [
            "Projects won",
            `${won} of ${total} (${total ? Math.round((won * 100) / total) : 0}%)`,
          ],
          ["Overdue follow-ups", String(data.overdue)],
        ].map(([label, value]) => (
          <article key={label} className="card p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ocean-950">
              {value}
            </p>
          </article>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        All CRM projects. Values are opportunity estimates; received revenue is
        in the billing reports.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Pipeline value</h2>
          {data.stages.map((s) => (
            <div
              key={s.name}
              className="flex justify-between border-b py-3 text-sm"
            >
              <span>
                {s.name} · {s.count}
              </span>
              <span>{money(s.value_cents)}</span>
            </div>
          ))}
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Lead sources</h2>
          {data.sources.map((s) => (
            <div
              key={s.name}
              className="flex justify-between border-b py-3 text-sm"
            >
              <span>
                {s.name} · {s.count}
              </span>
              <span>{money(s.value_cents)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
