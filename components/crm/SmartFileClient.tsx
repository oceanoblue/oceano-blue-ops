"use client";
import { useEffect, useRef, useState } from "react";
import type { FileDocument, FileContext } from "@/lib/crm/acquisition-types";
import { SmartFileDocument } from "./SmartFileDocument";
export function SmartFileClient({
  token,
  document: doc,
  context,
  responded,
  readOnly = false,
}: {
  token: string;
  document: FileDocument;
  context: FileContext;
  responded: boolean;
  readOnly?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [done, setDone] = useState(responded),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef<string | null>(null),
    viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || readOnly) return;
    viewed.current = true;
    void fetch(`/api/smart-files/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "view", id: crypto.randomUUID() }),
    }).catch(() => {});
  }, [token, readOnly]);
  const questions = doc.blocks.some((b) => b.kind === "question");
  return (
    <main className="mx-auto max-w-3xl p-5 sm:py-14">
      <div className="card p-6 sm:p-10">
        {readOnly && (
          <p className="mb-6 rounded-xl bg-ocean-50 p-4 text-sm text-ocean-900">
            This is a read-only preview. Client responses are submitted through
            the live file link.
          </p>
        )}
        {done && (
          <p
            role="status"
            className="mb-7 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            Your response has been received. Our team will review it and contact
            you about the next steps.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (readOnly || busy || done) return;
            setBusy(true);
            setError("");
            requestId.current ??= crypto.randomUUID();
            try {
              const r = await fetch(`/api/smart-files/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "respond",
                  id: requestId.current,
                  answers,
                }),
              });
              const b = await r.json();
              if (!r.ok) throw new Error(b.error);
              setDone(true);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Unable to save. Please retry.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <SmartFileDocument
            document={doc}
            context={context}
            answers={answers}
            onAnswer={(key, value) =>
              setAnswers((a) => ({ ...a, [key]: value }))
            }
            disabled={done || busy || readOnly}
            hideQuestions={done}
          />
          {questions && !done && !readOnly && (
            <div className="mt-8 border-t border-ink-100 pt-6">
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                Your answers will be shared with the Oceano Blue team for this
                project.
              </p>
              <button className="btn-primary" disabled={busy}>
                {busy ? "Saving response…" : "Submit response"}
              </button>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">
        Oceano Blue Media ·{" "}
        <a className="underline" href="mailto:info@oceanoblue.net">
          Contact our office
        </a>
      </p>
    </main>
  );
}
