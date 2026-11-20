"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  ONBOARDING_LABEL,
  ONBOARDING_STEPS,
  dollarsToCents,
  formatCents,
  parseTerms,
  shortDate,
  termEndLabel,
  monthLabel,
} from "@/lib/social/schema";
import type { Program } from "@/lib/social/server";
import { useSocialAction } from "./useSocialAction";

const dollars = (cents: number) => (cents ? String(cents / 100) : "");
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** What the client bought: fee, term, rates for a changing sub-account list, due date and brand rules. */
export function ProgramTerms({ program, accountCount, open = false }: { program: Program; accountCount: number; open?: boolean }) {
  const { run, busy, error } = useSocialAction();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    contact_name: program.contact_name,
    contact_email: program.contact_email,
    publishing_tool: program.publishing_tool,
    monthly_fee: dollars(program.monthly_fee_cents),
    account_rate: dollars(program.account_rate_cents),
    minimum_fee: dollars(program.minimum_fee_cents),
    term_start: program.term_start ?? "",
    term_months: program.term_months ? String(program.term_months) : "",
    media_due_day: program.media_due_day ? String(program.media_due_day) : "",
    agreement_url: program.agreement_url,
    avoid_terms: program.avoid_terms.join(", "),
    notes: program.notes,
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };
  const summary = [
    program.monthly_fee_cents > 0 && `${formatCents(program.monthly_fee_cents)} a month`,
    program.term_start && program.term_months > 0 && `${program.term_months} months, ${monthLabel(program.term_start.slice(0, 7))} to ${termEndLabel(program.term_start, program.term_months)}`,
    program.media_due_day && `media due on the ${ordinal(program.media_due_day)}`,
    program.monthly_fee_cents > 0 && accountCount > 0 && `${formatCents(Math.round(program.monthly_fee_cents / accountCount))} per sub-account`,
  ].filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const day = Math.round(Number(form.media_due_day));
    const ok = await run({
      action: "update_program",
      id: program.id,
      patch: {
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        publishing_tool: form.publishing_tool,
        monthly_fee_cents: dollarsToCents(form.monthly_fee),
        account_rate_cents: dollarsToCents(form.account_rate),
        minimum_fee_cents: dollarsToCents(form.minimum_fee),
        term_start: form.term_start || null,
        term_months: Math.max(0, Math.min(60, Math.round(Number(form.term_months) || 0))),
        media_due_day: day >= 1 && day <= 28 ? day : null,
        agreement_url: form.agreement_url.trim(),
        avoid_terms: parseTerms(form.avoid_terms),
        notes: form.notes,
      },
    });
    if (ok) setSaved(true);
  }

  return (
    <details className="card group" open={open}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-5">
        <span>
          <span className="block font-display text-lg font-semibold text-ocean-950">Terms and brand rules</span>
          <span className="mt-0.5 block text-sm text-slate-600">{summary.length ? summary.join(" · ") : "Add the fee, term and brand rules for this client."}</span>
        </span>
        {program.agreement_url && (
          <a href={program.agreement_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-ocean-700 hover:underline">
            Agreement <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </summary>
      <form onSubmit={save} className="grid gap-4 border-t border-ink-100 p-5 sm:grid-cols-6">
        <label className="sm:col-span-2">
          <span className="label">Monthly fee ($)</span>
          <input className="input" inputMode="decimal" value={form.monthly_fee} onChange={set("monthly_fee")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Per sub-account added or removed ($)</span>
          <input className="input" inputMode="decimal" value={form.account_rate} onChange={set("account_rate")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Minimum monthly fee ($)</span>
          <input className="input" inputMode="decimal" value={form.minimum_fee} onChange={set("minimum_fee")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Term starts</span>
          <input type="date" className="input" value={form.term_start} onChange={set("term_start")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Term (months)</span>
          <input type="number" min={0} max={60} className="input" value={form.term_months} onChange={set("term_months")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Media due (day of month)</span>
          <input type="number" min={1} max={28} className="input" value={form.media_due_day} onChange={set("media_due_day")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Client contact</span>
          <input className="input" maxLength={160} value={form.contact_name} onChange={set("contact_name")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Contact email</span>
          <input type="email" className="input" maxLength={254} value={form.contact_email} onChange={set("contact_email")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Publishing tool</span>
          <input className="input" maxLength={80} value={form.publishing_tool} onChange={set("publishing_tool")} />
        </label>
        <label className="sm:col-span-6">
          <span className="label">Link to an agreement signed outside this system</span>
          <input type="url" className="input" maxLength={500} placeholder="https://" value={form.agreement_url} onChange={set("agreement_url")} />
        </label>
        <label className="sm:col-span-6">
          <span className="label">Words and phrases no caption may use</span>
          <input className="input" value={form.avoid_terms} onChange={set("avoid_terms")} placeholder="Separate with commas. Applies to every sub-account of this client." />
        </label>
        <label className="sm:col-span-6">
          <span className="label">Notes</span>
          <textarea className="input min-h-20" maxLength={4000} value={form.notes} onChange={set("notes")} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-6">
          <button className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save details"}</button>
          <p role="status" className={`text-sm ${error ? "text-rose-700" : "text-emerald-700"}`}>{error || (saved ? "Saved." : "")}</p>
        </div>
      </form>
    </details>
  );
}

/** The standard steps to bring a new client live, ticked off as they are done. */
export function OnboardingChecklist({ program }: { program: Program }) {
  const { run, busy, error } = useSocialAction();
  const done = ONBOARDING_STEPS.filter((s) => program.onboarding[s]).length;
  return (
    <details className="card" open={program.status === "onboarding" && done < ONBOARDING_STEPS.length}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-5">
        <span className="font-display text-lg font-semibold text-ocean-950">Onboarding checklist</span>
        <span className="flex items-center gap-3 text-sm text-slate-600">
          <span className="h-2 w-28 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
            <span className="block h-full bg-ocean-600" style={{ width: `${(done / ONBOARDING_STEPS.length) * 100}%` }} />
          </span>
          {done} of {ONBOARDING_STEPS.length} done
        </span>
      </summary>
      <ul className="grid gap-x-6 border-t border-ink-100 p-5 sm:grid-cols-2">
        {ONBOARDING_STEPS.map((step) => {
          const when = program.onboarding[step];
          return (
            <li key={step}>
              <label className="flex cursor-pointer items-start gap-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!when}
                  disabled={busy}
                  onChange={(e) => run({ action: "set_onboarding_step", id: program.id, step, done: e.target.checked })}
                />
                <span className={when ? "text-slate-500" : "text-ink-900"}>
                  {ONBOARDING_LABEL[step]}
                  {when && <span className="ml-2 text-xs text-slate-400">{shortDate(when)}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="px-5 pb-4 text-sm text-rose-700">{error}</p>}
    </details>
  );
}
