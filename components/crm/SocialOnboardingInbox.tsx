"use client";

import { useState } from "react";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
  FILE_KIND_LABEL,
  answerRows,
  formatBytes,
  type FileKind,
} from "@/lib/social-onboarding/schema";
import type { SocialIntake } from "@/lib/social-onboarding/server";

const PUBLIC_PATH = "/social/start";

export function SocialOnboardingInbox({
  initial,
  production,
}: {
  initial: SocialIntake[] | null;
  production: boolean;
}) {
  const [intakes, setIntakes] = useState(initial ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function setStatus(id: string, status: "new" | "reviewed") {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/crm/social-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Unable to save.");
      setIntakes((list) =>
        list.map((i) =>
          i.id === id
            ? { ...i, status, reviewed_at: status === "reviewed" ? new Date().toISOString() : null }
            : i,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${PUBLIC_PATH}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the path is shown on screen.
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink-950">Social onboarding</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            What new social media clients sent through the onboarding page:
            their answers, where they are with account access, and their files.
          </p>
        </div>
        <button type="button" onClick={copyLink} className="btn-secondary">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Link copied" : "Copy client link"}</span>
        </button>
      </div>

      {initial === null && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Social onboarding couldn&apos;t be loaded. If this page is new, the
          database update for it may not be installed yet.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {initial !== null && intakes.length === 0 && (
        <div className="card p-8 text-center">
          <p className="font-display text-xl text-ink-950">No one has sent the form yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Copy the client link above and send it to a new social media client.
          </p>
        </div>
      )}

      <ul className="space-y-4">
        {intakes.map((intake) => {
          const uploaded = intake.files.filter((f) => f.status === "uploaded");
          const pending = intake.files.length - uploaded.length;
          const kinds = [...new Set(uploaded.map((f) => f.kind))] as FileKind[];
          return (
            <li key={intake.id} className="card overflow-hidden">
              <details open={intake.status === "new"}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 focus-visible:outline-2 focus-visible:outline-ocean-500">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-xl text-ink-950">{intake.business_name}</p>
                    <p className="truncate text-sm text-slate-600">
                      {intake.contact_name}, {intake.package}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500">
                    {new Date(intake.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${intake.status === "new" ? "bg-ocean-100 text-ocean-900" : "bg-ink-100 text-ink-700"}`}
                  >
                    {intake.status === "new" ? "New" : "Reviewed"}
                  </span>
                </summary>
                <div className="grid gap-8 border-t border-ink-100 px-5 py-5 lg:grid-cols-[1.4fr_1fr]">
                  <dl className="space-y-3 text-sm">
                    {answerRows(intake.answers).map((row) => (
                      <div key={row.label} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4">
                        <dt className="text-slate-500">{row.label}</dt>
                        <dd className="whitespace-pre-wrap break-words text-ink-900">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div>
                    <h2 className="text-sm font-semibold text-ink-950">
                      Files ({uploaded.length})
                    </h2>
                    {pending > 0 && (
                      <p className="mt-1 text-sm text-amber-800">
                        {pending} more {pending === 1 ? "file was" : "files were"} started but didn&apos;t finish uploading.
                      </p>
                    )}
                    {uploaded.length === 0 && pending === 0 && (
                      <p className="mt-1 text-sm text-slate-500">No files uploaded.</p>
                    )}
                    {kinds.map((kind) => (
                      <div key={kind} className="mt-4">
                        <p className="text-xs font-medium text-slate-500">{FILE_KIND_LABEL[kind]}</p>
                        <ul className="mt-1.5 divide-y divide-ink-100 rounded-lg ring-1 ring-ink-100">
                          {uploaded
                            .filter((f) => f.kind === kind)
                            .map((f) => (
                              <li key={f.id}>
                                <a
                                  href={`/api/crm/social-onboarding/files/${f.id}`}
                                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-ocean-50 focus-visible:outline-2 focus-visible:outline-ocean-500"
                                >
                                  <Download className="h-4 w-4 shrink-0 text-ocean-700" aria-hidden="true" />
                                  <span className="min-w-0 flex-1 truncate text-ink-900">{f.original_name}</span>
                                  <span className="shrink-0 text-xs text-slate-500">
                                    {formatBytes(f.size_bytes ?? f.declared_bytes)}
                                  </span>
                                </a>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                    <div className="mt-6 flex flex-wrap gap-2">
                      <a className="btn-secondary" href={`mailto:${intake.email}`}>
                        Email {intake.contact_name.split(/\s+/)[0]}
                      </a>
                      <button
                        type="button"
                        disabled={!production || busy === intake.id}
                        onClick={() => setStatus(intake.id, intake.status === "new" ? "reviewed" : "new")}
                        className={intake.status === "new" ? "btn-primary" : "btn-ghost"}
                      >
                        {intake.status === "new" ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        )}
                        {intake.status === "new" ? "Mark reviewed" : "Mark as new"}
                      </button>
                    </div>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
