"use client";
import { useState, type FormEvent } from "react";
import type { InquiryField } from "@/lib/crm/types";
export function InquiryForm({
  slug,
  title,
  description,
  fields,
  readOnly = false,
}: {
  slug: string;
  title: string;
  description: string;
  fields: InquiryField[];
  readOnly?: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || readOnly) return;
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form),
      answers: Record<string, string> = {};
    for (const f of fields) answers[f.key] = String(fd.get(f.key) || "");
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    const url = new URL(window.location.href);
    try {
      const res = await fetch(`/api/inquiry-forms/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: id,
          website: fd.get("website"),
          answers,
          attribution: {
            source: url.searchParams.get("utm_source") || "",
            medium: url.searchParams.get("utm_medium") || "",
            campaign: url.searchParams.get("utm_campaign") || "",
            referrer: document.referrer.slice(0, 500),
          },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSuccess(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (success)
    return (
      <div
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8"
        role="status"
      >
        <h1 className="font-display text-2xl text-ocean-950">Thank you</h1>
        <p className="mt-3 text-slate-700">{success}</p>
      </div>
    );
  return (
    <form
      onSubmit={submit}
      onChange={() => {
        if (!busy) setRequestId(null);
      }}
      className="space-y-5"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-ocean-600">
          Oceano Blue Media
        </p>
        <h1 className="mt-2 font-display text-3xl text-ocean-950">{title}</h1>
        <p className="mt-3 text-slate-600">{description}</p>
      </div>
      {readOnly && (
        <p className="rounded-xl bg-ocean-50 p-4 text-sm text-ocean-900">
          This is a read-only preview. Use the live website form to send an
          inquiry.
        </p>
      )}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <fieldset
        disabled={busy || readOnly}
        className="grid gap-5 sm:grid-cols-2"
      >
        {fields.map((f) => (
          <label
            key={f.key}
            className={`block text-sm font-medium text-slate-700 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}
          >
            {f.label}
            {f.required ? " *" : ""}
            {f.type === "textarea" ? (
              <textarea
                name={f.key}
                required={f.required}
                maxLength={10000}
                rows={5}
                className="input mt-1 w-full"
              />
            ) : f.type === "select" ? (
              <select
                name={f.key}
                required={f.required}
                className="input mt-1 w-full"
              >
                <option value="">Select an option</option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                name={f.key}
                type={f.type}
                required={f.required}
                min={f.type === "number" ? 0 : undefined}
                maxLength={f.key === "full_name" ? 180 : 500}
                autoComplete={
                  f.key === "email"
                    ? "email"
                    : f.key === "full_name"
                      ? "name"
                      : f.key === "phone"
                        ? "tel"
                        : undefined
                }
                className="input mt-1 w-full"
              />
            )}
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        We’ll use these details to respond to your inquiry.
      </p>
      <button
        disabled={busy || readOnly}
        className="btn-primary w-full sm:w-auto"
      >
        {busy ? "Sending…" : "Send inquiry"}
      </button>
    </form>
  );
}
