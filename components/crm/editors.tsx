"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  defaultFields,
  type CrmContact,
  type CrmData,
  type CrmForm,
  type Deal,
  type InquiryField,
  type Stage,
  type Automation,
} from "@/lib/crm/types";
import { csvContacts } from "@/lib/crm/csv";
export type Save = (action: Record<string, unknown>) => Promise<void>;
export const Label = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => (
  <label className="block text-sm font-medium text-slate-700">
    {name}
    <span className="mt-1 block">{children}</span>
  </label>
);
export function Editor({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-ink-950/40"
    >
      <section className="min-h-full p-5 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-ocean-950">{title}</h2>
          <button className="btn-secondary" onClick={close}>
            Close
          </button>
        </div>
        {children}
      </section>
    </dialog>
  );
}
export function ContactEditor({
  contact,
  save,
}: {
  contact?: CrmContact;
  save: Save;
}) {
  const profile = contact?.crm_contact_profiles;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await save({
            action: contact ? "contact_update" : "contact_create",
            id: contact?.id || crypto.randomUUID(),
            version: profile?.version || 1,
            data: {
              full_name: f.get("full_name"),
              email: f.get("email"),
              phone: f.get("phone"),
              billing_address: f.get("billing_address"),
              company: f.get("company"),
              status: f.get("status"),
              notes: f.get("notes"),
              tags: String(f.get("tags"))
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            },
          });
        } catch (e) {
          setError(String(e instanceof Error ? e.message : e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Label name="Full name">
        <input
          className="input w-full"
          name="full_name"
          required
          maxLength={180}
          defaultValue={contact?.full_name}
        />
      </Label>
      <Label name="Email">
        <input
          className="input w-full"
          name="email"
          type="email"
          required
          maxLength={254}
          defaultValue={contact?.email}
        />
      </Label>
      <Label name="Phone">
        <input
          className="input w-full"
          name="phone"
          type="tel"
          maxLength={80}
          defaultValue={contact?.phone || ""}
        />
      </Label>
      <Label name="Company">
        <input
          className="input w-full"
          name="company"
          maxLength={180}
          defaultValue={profile?.company || contact?.brokerage || ""}
        />
      </Label>
      <Label name="Billing address">
        <textarea
          className="input w-full"
          name="billing_address"
          maxLength={2000}
          defaultValue={contact?.billing_address || ""}
        />
      </Label>
      <Label name="Relationship">
        <select
          className="input w-full"
          name="status"
          defaultValue={profile?.status || (contact ? "client" : "lead")}
        >
          <option value="lead">Lead</option>
          <option value="client">Client</option>
          <option value="archived">Archived</option>
        </select>
      </Label>
      <Label name="Tags, separated by commas">
        <input
          className="input w-full"
          name="tags"
          defaultValue={profile?.tags?.join(", ") || ""}
        />
      </Label>
      <Label name="Contact notes">
        <textarea
          className="input w-full"
          rows={6}
          maxLength={10000}
          name="notes"
          defaultValue={contact?.notes || ""}
        />
      </Label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button disabled={busy} className="btn-primary">
        {busy ? "Saving…" : "Save contact"}
      </button>
    </form>
  );
}
const localDate = (s: string | null) =>
  s
    ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
export function DealEditor({
  deal,
  data,
  save,
  clientId,
}: {
  deal?: Deal;
  data: CrmData;
  save: Save;
  clientId?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        const follow = String(f.get("next_follow_up") || "");
        try {
          await save({
            action: deal ? "deal_update" : "deal_create",
            id: deal?.id || crypto.randomUUID(),
            version: deal?.version,
            data: {
              client_id: deal?.client_id || f.get("client_id"),
              title: f.get("title"),
              stage_id: f.get("stage_id"),
              project_type: f.get("project_type"),
              lead_source: f.get("lead_source"),
              value_cents: Math.round(Number(f.get("value")) * 100),
              project_date: f.get("project_date") || null,
              next_follow_up: follow ? new Date(follow).toISOString() : null,
              owner_id: f.get("owner_id") || null,
              description: f.get("description"),
              lost_reason: f.get("lost_reason"),
            },
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {!deal ? (
        <Label name="Contact">
          <select
            className="input w-full"
            name="client_id"
            required
            defaultValue={clientId || ""}
          >
            <option value="">Choose a contact</option>
            {clientId && !data.contacts.some((c) => c.id === clientId) ? (
              <option value={clientId}>Selected contact</option>
            ) : null}
            {data.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} · {c.email}
              </option>
            ))}
          </select>
        </Label>
      ) : null}
      <Label name="Project name">
        <input
          className="input w-full"
          name="title"
          required
          maxLength={180}
          defaultValue={deal?.title}
        />
      </Label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label name="Stage">
          <select
            className="input w-full"
            name="stage_id"
            defaultValue={deal?.stage_id || data.stages[0]?.id}
          >
            {data.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Label>
        <Label name="Estimated value ($)">
          <input
            type="number"
            min="0"
            max="20000000"
            step="0.01"
            className="input w-full"
            name="value"
            defaultValue={(deal?.value_cents || 0) / 100}
          />
        </Label>
        <Label name="Project type">
          <input
            className="input w-full"
            name="project_type"
            maxLength={100}
            defaultValue={deal?.project_type}
          />
        </Label>
        <Label name="Lead source">
          <input
            className="input w-full"
            name="lead_source"
            maxLength={150}
            defaultValue={deal?.lead_source}
          />
        </Label>
        <Label name="Project date">
          <input
            type="date"
            className="input w-full"
            name="project_date"
            defaultValue={deal?.project_date || ""}
          />
        </Label>
        <Label name="Next follow-up (your local time)">
          <input
            type="datetime-local"
            className="input w-full"
            name="next_follow_up"
            defaultValue={localDate(deal?.next_follow_up || null)}
          />
        </Label>
      </div>
      <Label name="Owner">
        <select
          className="input w-full"
          name="owner_id"
          defaultValue={deal?.owner_id || ""}
        >
          <option value="">Unassigned</option>
          {data.team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
      </Label>
      <Label name="Project brief">
        <textarea
          className="input w-full"
          rows={5}
          maxLength={10000}
          name="description"
          defaultValue={deal?.description}
        />
      </Label>
      <Label name="Reason lost (if applicable)">
        <input
          className="input w-full"
          maxLength={1000}
          name="lost_reason"
          defaultValue={deal?.lost_reason}
        />
      </Label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button disabled={busy} className="btn-primary">
        {busy ? "Saving…" : "Save project"}
      </button>
    </form>
  );
}
export function FormEditor({
  form,
  team,
  save,
}: {
  form?: CrmForm;
  team: CrmData["team"];
  save: Save;
}) {
  const [fields, setFields] = useState<InquiryField[]>(
      form?.fields || defaultFields.map((f) => ({ ...f })),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function update(i: number, v: Partial<InquiryField>) {
    setFields((old) => old.map((f, n) => (n === i ? { ...f, ...v } : f)));
  }
  function move(i: number, delta: number) {
    setFields((old) => {
      const copy = [...old];
      [copy[i], copy[i + delta]] = [copy[i + delta], copy[i]];
      return copy;
    });
  }
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await save({
            action: "form_save",
            id: form?.id || crypto.randomUUID(),
            version: form?.version || 0,
            data: {
              name: f.get("name"),
              slug: f.get("slug"),
              title: f.get("title"),
              description: f.get("description"),
              success_message: f.get("success_message"),
              default_project_type: f.get("default_project_type"),
              owner_id: f.get("owner_id") || null,
              published: f.get("published") === "on",
              fields,
            },
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Label name="Internal name">
        <input
          className="input w-full"
          required
          name="name"
          maxLength={150}
          defaultValue={form?.name || "Website contact form"}
        />
      </Label>
      <Label name="Link name">
        <input
          className="input w-full"
          required
          name="slug"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={80}
          defaultValue={form?.slug || "contact"}
        />
      </Label>
      <Label name="Heading">
        <input
          className="input w-full"
          required
          name="title"
          maxLength={180}
          defaultValue={form?.title || "Tell us about your project"}
        />
      </Label>
      <Label name="Introduction">
        <textarea
          className="input w-full"
          name="description"
          maxLength={1000}
          defaultValue={
            form?.description || "We’d love to hear what you have in mind."
          }
        />
      </Label>
      <div className="space-y-3">
        <h3 className="font-semibold text-ocean-950">Questions</h3>
        {fields.map((field, i) => (
          <fieldset
            key={field.key}
            className="rounded-xl border border-slate-200 p-3"
          >
            <legend className="px-1 text-xs text-slate-500">
              Question {i + 1}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label name="Label">
                <input
                  className="input w-full"
                  value={field.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  required
                  maxLength={150}
                />
              </Label>
              <Label name="Answer type">
                <select
                  className="input w-full"
                  value={field.type}
                  disabled={["full_name", "email", "project_date"].includes(
                    field.key,
                  )}
                  onChange={(e) =>
                    update(i, { type: e.target.value as InquiryField["type"] })
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
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            {field.type === "select" ? (
              <Label name="Options, separated by commas">
                <input
                  className="input w-full"
                  defaultValue={field.options?.join(", ")}
                  onBlur={(e) =>
                    update(i, {
                      options: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Label>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  disabled={["full_name", "email", "project_date"].includes(
                    field.key,
                  )}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                Required
              </label>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="btn-secondary text-xs"
              >
                Move up
              </button>
              <button
                type="button"
                disabled={i === fields.length - 1}
                onClick={() => move(i, 1)}
                className="btn-secondary text-xs"
              >
                Move down
              </button>
              {!["full_name", "email"].includes(field.key) ? (
                <button
                  type="button"
                  onClick={() => setFields((f) => f.filter((_, n) => n !== i))}
                  className="text-sm text-red-700"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={fields.length >= 40}
          onClick={() =>
            setFields((f) => [
              ...f,
              {
                key: `question_${crypto.randomUUID().replace(/-/g, "")}`,
                label: "New question",
                type: "text",
                required: false,
              },
            ])
          }
          className="btn-secondary"
        >
          Add question
        </button>
      </div>
      <Label name="Default project type">
        <input
          className="input w-full"
          name="default_project_type"
          maxLength={100}
          defaultValue={form?.default_project_type}
        />
      </Label>
      <Label name="Assign inquiries to">
        <select
          className="input w-full"
          name="owner_id"
          defaultValue={form?.owner_id || ""}
        >
          <option value="">Unassigned</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
      </Label>
      <Label name="Confirmation message">
        <textarea
          className="input w-full"
          required
          maxLength={1000}
          name="success_message"
          defaultValue={
            form?.success_message ||
            "Your inquiry has been received. Our team will be in touch soon."
          }
        />
      </Label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={form?.published}
        />
        Accept inquiries through this form
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button disabled={busy} className="btn-primary">
        {busy ? "Saving…" : "Save form"}
      </button>
    </form>
  );
}
export function ImportEditor({ save }: { save: Save }) {
  const [contacts, setContacts] = useState<ReturnType<typeof csvContacts>>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [importId] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Import a HoneyBook contact CSV, up to 500 contacts. Existing email
        addresses are skipped, preserving current Ops details. Accepted columns:
        full name (or first/last name), email, phone, company, notes, address,
        tags.
      </p>
      <Label name="Choose CSV">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setError("");
            setContacts([]);
            if (!file) return;
            try {
              if (file.size > 2000000)
                throw new Error("CSV must be under 2 MB.");
              setContacts(csvContacts(await file.text()));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to read CSV.");
            }
          }}
        />
      </Label>
      {contacts.length ? (
        <>
          <p className="font-medium">
            {contacts.length} contacts ready to import
          </p>
          <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
            {contacts.slice(0, 20).map((c, i) => (
              <p key={i} className="border-b p-3 text-sm">
                {c.full_name} · {c.email}
              </p>
            ))}
          </div>
          <button
            disabled={busy}
            className="btn-primary"
            onClick={async () => {
              setBusy(true);
              try {
                await save({
                  action: "import",
                  id: importId,
                  data: { contacts },
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Import failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importing…" : "Import contacts"}
          </button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function StageEditor({ stage, save }: { stage?: Stage; save: Save }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          await save({
            action: "stage_save",
            id: stage?.id || crypto.randomUUID(),
            data: {
              name: f.get("name"),
              position: Number(f.get("position")),
              outcome: f.get("outcome"),
            },
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Save failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Label name="Stage name">
        <input
          className="input w-full"
          name="name"
          required
          maxLength={80}
          defaultValue={stage?.name}
        />
      </Label>
      <Label name="Position">
        <input
          className="input w-full"
          name="position"
          type="number"
          min={0}
          max={1000}
          required
          defaultValue={stage?.position || 0}
        />
      </Label>
      <Label name="Outcome">
        <select
          className="input w-full"
          name="outcome"
          defaultValue={stage?.outcome || "open"}
        >
          <option value="open">Open opportunity</option>
          <option value="won">Won / booked</option>
          <option value="lost">Lost</option>
          <option value="archived">Archived</option>
        </select>
      </Label>
      <p className="text-sm text-slate-500">
        New inquiries enter the first open stage. Positions determine column
        order.
      </p>
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      <button disabled={busy} className="btn-primary">
        Save stage
      </button>
    </form>
  );
}
export function AutomationEditor({
  automation,
  stages,
  save,
}: {
  automation?: Automation;
  stages: Stage[];
  save: Save;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          await save({
            action: "automation_save",
            id: automation?.id || crypto.randomUUID(),
            data: {
              name: f.get("name"),
              enabled: f.get("enabled") === "on",
              trigger: f.get("trigger"),
              stage_id: f.get("stage_id") || null,
              task_title: f.get("task_title"),
              delay_hours: Number(f.get("delay_hours")),
            },
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Save failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-600">
        Create an internal follow-up task when a new inquiry arrives or a
        project changes stage.
      </p>
      <Label name="Automation name">
        <input
          className="input w-full"
          name="name"
          required
          maxLength={120}
          defaultValue={automation?.name}
        />
      </Label>
      <Label name="When">
        <select
          className="input w-full"
          name="trigger"
          defaultValue={automation?.trigger || "inquiry_received"}
        >
          <option value="inquiry_received">Inquiry received</option>
          <option value="stage_changed">Project stage changed</option>
        </select>
      </Label>
      <Label name="Destination stage (stage changes only)">
        <select
          className="input w-full"
          name="stage_id"
          defaultValue={automation?.stage_id || ""}
        >
          <option value="">Any stage</option>
          {stages.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Label>
      <Label name="Task title">
        <input
          className="input w-full"
          name="task_title"
          required
          maxLength={180}
          defaultValue={automation?.task_title || "Follow up with client"}
        />
      </Label>
      <Label name="Due after (hours)">
        <input
          className="input w-full"
          type="number"
          min={0}
          max={8760}
          name="delay_hours"
          required
          defaultValue={automation?.delay_hours ?? 24}
        />
      </Label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={automation?.enabled}
        />
        Enabled
      </label>
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      <button disabled={busy} className="btn-primary">
        Save automation
      </button>
    </form>
  );
}
