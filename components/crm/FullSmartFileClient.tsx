"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ArrowRight,
  ArrowLeft,
  LockKeyhole,
  Printer,
  CalendarDays,
} from "lucide-react";
import { SmartFileDocument } from "./SmartFileDocument";
import {
  mergeText,
  validateFileAnswers,
  type FileDocument,
  type FileContext,
} from "@/lib/crm/acquisition-types";
import {
  money,
  priceSelection,
  signingConsent,
  type ExperienceBlock,
  type ExperienceState,
} from "@/lib/crm/smart-experience-types";
import type { PublicSessionType } from "@/lib/crm/scheduling-types";
const empty: ExperienceState = {
  acceptance: null,
  appointment: null,
  installments: [],
  payment_review: false,
};
export function FullSmartFileClient({
  token,
  document: doc,
  context,
  config,
  readOnly = false,
}: {
  token: string;
  document: FileDocument;
  context: FileContext;
  config: ExperienceBlock;
  readOnly?: boolean;
}) {
  const [state, setState] = useState<ExperienceState>(empty),
    [loaded, setLoaded] = useState(readOnly),
    [step, setStep] = useState(0);
  const [packageId, setPackageId] = useState(config.packages[0]?.id ?? ""),
    [addons, setAddons] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [signer, setSigner] = useState(""),
    [email, setEmail] = useState(""),
    [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [day, setDay] = useState(""),
    [slots, setSlots] = useState<string[]>([]),
    [slot, setSlot] = useState(""),
    [phone, setPhone] = useState(""),
    [emails, setEmails] = useState(false),
    [sessionType, setSessionType] = useState<PublicSessionType | null>(null),
    [checking, setChecking] = useState(false);
  const [zone, setZone] = useState("America/New_York");
  const progress = useRef<HTMLButtonElement>(null);
  const bookingId = useRef<string | null>(null),
    pending = useRef(false),
    focus = useRef<HTMLHeadingElement>(null);
  const base = `/api/smart-files/${token}/experience`;
  const viewed = useRef(false);
  useEffect(() => {
    if (readOnly || viewed.current) return;
    viewed.current = true;
    void fetch(`/api/smart-files/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view", id: crypto.randomUUID() }) }).catch(() => {});
  }, [token, readOnly]);
  const refresh = useCallback(async () => {
    if (readOnly) return empty;
    const r = await fetch(base, { cache: "no-store" }),
      b = await r.json();
    if (!r.ok) throw new Error(b.error || "Your progress could not be loaded.");
    const next = b as ExperienceState;
    setState(next);
    setLoaded(true);
    if (next.acceptance) {
      setPackageId(next.acceptance.package_id);
      setAddons(next.acceptance.addon_ids);
      setAnswers(next.acceptance.answers);
    }
    return next;
  }, [base, readOnly]);
  useEffect(() => {
    setZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    );
    void refresh()
      .then((s) => {
        if (s.acceptance)
          setStep(config.session_slug && !s.appointment ? 3 : 4);
      })
      .catch((e) => setError(e.message));
  }, [refresh, config.session_slug]);
  useEffect(() => {
    focus.current?.focus();
    progress.current?.scrollIntoView({block:"nearest",inline:"center"});
  }, [step]);
  useEffect(() => {
    if (
      step !== 3 ||
      !day ||
      readOnly ||
      !config.session_slug ||
      state.appointment
    )
      return;
    const controller = new AbortController();
    setChecking(true);
    setSlot("");
    setSlots([]);
    setError("");
    fetch(`${base}?date=${day}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setSlots(b.slots);
        setSessionType(b.type);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [base, day, step, readOnly, config.session_slug, state.appointment]);
  useEffect(() => {
    if (step !== 4 || readOnly || !state.acceptance) return;
    const onFocus = () => {
      void refresh().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 20000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [step, readOnly, refresh, state.acceptance]);
  const pricing = priceSelection(config, packageId, addons);
  const content = doc.blocks.filter(
    (b) => !["experience", "question"].includes(b.kind),
  );
  const pages: FileDocument["blocks"][] = [[]];
  for (const block of content) {
    if (block.kind === "page" && pages[pages.length - 1].length) pages.push([]);
    pages[pages.length - 1].push(block);
  }
  const [page, setPage] = useState(0);
  const labels = [
    "Overview",
    "Your package",
    "Agreement",
    ...(config.session_slug ? ["Schedule"] : []),
    "Payment",
  ];
  const activeIndex = step === 4 ? labels.length - 1 : step;
  const signed = !!state.acceptance;
  const deposit = state.installments[0];
  const paidDeposit =
    !!deposit &&
    deposit.paid_cents >= deposit.amount_cents &&
    !state.payment_review;
  const bookingComplete =
    paidDeposit &&
    (!config.session_slug || state.appointment?.status === "confirmed");
  const stamp = (s: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(s));
  async function act(body: unknown, nextStep?: number) {
    if (readOnly || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (!r.ok) throw new Error(b.error || "Please retry.");
      if (b.url) {
        window.location.assign(b.url);
        return;
      }
      await refresh();
      if (nextStep !== undefined) setStep(nextStep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const advance = () => {
    setError("");
    setStep((s) => (s === 2 && !config.session_slug ? 4 : s + 1));
  };
  return (
    <main className="min-h-screen bg-[#f4f6f9] px-4 py-6 text-ink-950 sm:px-8 sm:py-10">
      <style>{`@media print { .smart-no-print { display:none!important } .smart-print { display:block!important } body { background:white!important } }`}</style>
      <div className="smart-no-print mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold tracking-[.18em] text-ocean-900">
            OCEANO BLUE{" "}
            <span className="font-normal tracking-normal">Media</span>
          </p>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <LockKeyhole size={14} />
            Your private project file
          </span>
        </header>
        <nav
          aria-label="Booking progress"
          className="mb-8 flex gap-2 overflow-x-auto pb-2"
        >
          {labels.map((label, i) => (
            <button
              key={label}
              ref={i===activeIndex ? progress : undefined}
              type="button"
              aria-current={i === activeIndex ? "step" : undefined}
              disabled={busy || i > activeIndex}
              onClick={() => {
                setError("");
                setStep(i === labels.length - 1 ? 4 : i);
              }}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm ${i === activeIndex ? "bg-ocean-900 text-white" : "bg-white text-slate-600"}`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full border border-current text-xs">
                {i < activeIndex ? <Check size={12} /> : i + 1}
              </span>
              {label}
            </button>
          ))}
        </nav>
        {readOnly && (
          <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            Client preview. Explore the steps; signatures, reservations and
            payments are disabled.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-900"
          >
            {error}
            {!loaded && (
              <button
                type="button"
                className="ml-4 underline"
                onClick={() => void refresh().catch((e) => setError(e.message))}
              >
                Retry
              </button>
            )}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <section className="min-w-0 rounded-3xl bg-white p-6 shadow-sm sm:p-10">
            <p className="mb-3 text-xs uppercase tracking-[.16em] text-ocean-700">
              {context.project_name}
            </p>
            <h1
              ref={focus}
              tabIndex={-1}
              className="mb-8 text-3xl font-semibold tracking-tight outline-none sm:text-4xl"
            >
              {step === 0
                ? mergeText(doc.title, context)
                : step === 1
                  ? "Make it yours"
                  : step === 2
                    ? "Review & sign"
                    : step === 3
                      ? "Choose your session"
                      : bookingComplete
                        ? "You’re all set"
                        : "Complete your booking"}
            </h1>
            {!loaded ? (
              <p role="status">Loading your project…</p>
            ) : (
              <>
                {step === 0 && (
                  <>
                    <SmartFileDocument
                      document={{
                        ...doc,
                        title: "",
                        description: page === 0 ? doc.description : "",
                        blocks: pages[page],
                      }}
                      context={context}
                      disabled
                    />
                    <div className="mt-10 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ArrowLeft size={16} />
                        Previous
                      </button>
                      <span className="text-xs text-slate-500">
                        {page + 1} / {pages.length}
                      </span>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() =>
                          page < pages.length - 1
                            ? setPage((p) => p + 1)
                            : advance()
                        }
                      >
                        {page < pages.length - 1
                          ? "Next page"
                          : "Explore packages"}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <p className="mb-6 text-slate-600">
                      Choose the option that fits your needs.
                    </p>
                    <fieldset disabled={signed} className="space-y-4">
                      <legend className="sr-only">Packages</legend>
                      {config.packages.map((p) => (
                        <label
                          key={p.id}
                          className={`block cursor-pointer rounded-2xl border-2 p-5 ${packageId === p.id ? "border-ocean-600 bg-ocean-50/50" : "border-ink-100"}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <span className="flex items-center gap-3 font-semibold">
                              <input
                                type="radio"
                                name="package"
                                value={p.id}
                                checked={packageId === p.id}
                                onChange={() => setPackageId(p.id)}
                              />
                              {p.title}
                            </span>
                            <span className="font-semibold">
                              {money(p.price_cents)}
                            </span>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                            {p.description}
                          </p>
                        </label>
                      ))}
                    </fieldset>
                    {config.addons.length > 0 && (
                      <fieldset disabled={signed} className="mt-8 space-y-3">
                        <legend className="mb-4 text-lg font-semibold">
                          A little extra
                        </legend>
                        {config.addons.map((a) => (
                          <label
                            key={a.id}
                            className="flex items-start gap-3 rounded-xl border border-ink-100 p-4"
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={addons.includes(a.id)}
                              onChange={(e) =>
                                setAddons((old) =>
                                  e.target.checked
                                    ? [...old, a.id]
                                    : old.filter((id) => id !== a.id),
                                )
                              }
                            />
                            <span className="flex-1">
                              <span className="font-medium">{a.title}</span>
                              <span className="mt-1 block text-sm text-slate-500">
                                {a.description}
                              </span>
                            </span>
                            <span className="text-sm">
                              +{money(a.price_cents)}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                    {signed && (
                      <p className="mt-4 text-sm text-slate-500">
                        Your signed selection is preserved. Contact our office
                        for changes.
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn-primary mt-8"
                      onClick={advance}
                    >
                      Continue
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {step === 2 && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (signed || readOnly) {
                        advance();
                        return;
                      }
                      try {
                        validateFileAnswers(doc, answers);
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Check your answers.",
                        );
                        return;
                      }
                      void act(
                        {
                          action: "accept",
                          package_id: packageId,
                          addon_ids: addons,
                          signer_name: signer,
                          signer_email: email,
                          consent,
                          answers,
                        },
                        config.session_slug ? 3 : 4,
                      );
                    }}
                  >
                    <SmartFileDocument
                      document={{
                        ...doc,
                        title: "",
                        description: "",
                        blocks: doc.blocks.filter((b) => b.kind === "question"),
                      }}
                      context={context}
                      answers={answers}
                      onAnswer={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
                      disabled={signed}
                    />
                    <h2 className="mb-4 mt-8 text-xl font-semibold">
                      Service agreement
                    </h2>
                    <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-ink-100 bg-slate-50 p-5 text-sm leading-relaxed">
                      {state.acceptance?.agreement ||
                        mergeText(config.terms, context) ||
                        "Add your approved agreement in the template editor."}
                    </div>
                    <div className="my-6 rounded-xl bg-ocean-50 p-5 text-sm">
                      <p>
                        Total: <strong>{money(pricing.total)}</strong>
                      </p>
                      <p className="mt-2">
                        Due to complete booking:{" "}
                        <strong>{money(pricing.deposit)}</strong>
                      </p>
                      {pricing.balance > 0 && (
                        <p className="mt-2">
                          Remaining {money(pricing.balance)} due{" "}
                          {config.balance_days} days after signing.
                        </p>
                      )}
                      <p className="mt-3">
                        Save a copy using Print / Save PDF below. Contact the
                        office if you prefer to sign on paper.
                      </p>
                    </div>
                    {signed ? (
                      <p className="text-sm text-emerald-800">
                        Signed by {state.acceptance?.signer_name} on{" "}
                        {stamp(state.acceptance!.accepted_at)}.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <label className="block text-sm">
                          Full legal name
                          <input
                            className="input mt-2"
                            required
                            minLength={2}
                            maxLength={120}
                            autoComplete="name"
                            value={signer}
                            onChange={(e) => setSigner(e.target.value)}
                          />
                        </label>
                        <label className="block text-sm">
                          Email this file was sent to
                          <input
                            className="input mt-2"
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </label>
                        <label className="flex items-start gap-3 text-sm leading-relaxed">
                          <input
                            className="mt-1"
                            type="checkbox"
                            required
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                          />
                          <span>{signingConsent}</span>
                        </label>
                      </div>
                    )}
                    <button
                      className="btn-primary mt-7"
                      disabled={
                        busy || (!signed && !readOnly && !config.terms.trim())
                      }
                    >
                      {busy
                        ? "Saving agreement…"
                        : signed || readOnly
                          ? "Continue"
                          : "Sign agreement & continue"}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
                {step === 3 && (
                  <>
                    {state.appointment ? (
                      <div>
                        <p className="text-lg">
                          {stamp(state.appointment.starts_at)}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {zone} · {state.appointment.status}
                        </p>
                        <a
                          className="btn-secondary mt-5"
                          href={`/meet/manage/${state.appointment.manage_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Manage session
                        </a>
                        <button
                          type="button"
                          className="btn-primary ml-3 mt-5"
                          onClick={() => setStep(4)}
                        >
                          Continue to payment
                        </button>
                      </div>
                    ) : readOnly ? (
                      <>
                        <p className="text-slate-600">
                          The live client will choose from the published
                          calendar for “{config.session_slug}” here.
                        </p>
                        <button
                          type="button"
                          className="btn-primary mt-6"
                          onClick={() => setStep(4)}
                        >
                          Preview payment
                        </button>
                      </>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          bookingId.current ??= crypto.randomUUID();
                          void act(
                            {
                              action: "book",
                              id: bookingId.current,
                              starts_at: slot,
                              phone,
                              email_consent: emails,
                            },
                            4,
                          );
                        }}
                      >
                        <p className="mb-5 text-sm text-slate-600">
                          Reserve your session, then complete your booking
                          payment.
                        </p>
                        <label className="block text-sm">
                          Calendar date
                          <input
                            type="date"
                            required
                            className="input mt-2"
                            value={day}
                            onChange={(e) => {
                              setDay(e.target.value);
                              bookingId.current = null;
                            }}
                          />
                        </label>
                        {sessionType && (
                          <p className="mt-3 text-sm text-slate-500">
                            {sessionType.duration_minutes} minutes ·{" "}
                            {sessionType.location}
                            <br />
                            Calendar dates in {sessionType.timezone}. Times
                            below shown in {zone}.
                          </p>
                        )}
                        {checking && (
                          <p className="mt-5" role="status">
                            Checking availability…
                          </p>
                        )}
                        <fieldset className="my-6 grid gap-2 sm:grid-cols-2">
                          <legend className="sr-only">Available times</legend>
                          {slots.map((s) => (
                            <label
                              key={s}
                              className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${slot === s ? "border-ocean-600 bg-ocean-50" : "border-ink-100"}`}
                            >
                              <input
                                type="radio"
                                name="time"
                                required
                                checked={slot === s}
                                onChange={() => {
                                  setSlot(s);
                                  bookingId.current = null;
                                }}
                              />
                              {stamp(s)}
                            </label>
                          ))}
                        </fieldset>
                        {day && !checking && !slots.length && (
                          <p className="mb-5 text-sm">
                            No available times. Choose another date.
                          </p>
                        )}
                        <label className="block text-sm">
                          Phone number
                          <input
                            className="input mt-2"
                            type="tel"
                            maxLength={50}
                            value={phone}
                            onChange={(e) => {
                              setPhone(e.target.value);
                              bookingId.current = null;
                            }}
                          />
                        </label>
                        <label className="mt-5 flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={emails}
                            onChange={(e) => {
                              setEmails(e.target.checked);
                              bookingId.current = null;
                            }}
                          />
                          Email me session confirmation and reminders.
                        </label>
                        <button
                          className="btn-primary mt-6"
                          disabled={busy || !slot}
                        >
                          {busy ? "Reserving…" : "Reserve session & continue"}
                        </button>
                      </form>
                    )}
                  </>
                )}
                {step === 4 && (
                  <>
                    {bookingComplete ? (
                      <p className="mb-6 rounded-2xl bg-emerald-50 p-5 text-emerald-900">
                        Your agreement is signed
                        {config.session_slug
                          ? ", your session is reserved,"
                          : ""}{" "}
                        and your booking payment is received.
                      </p>
                    ) : (
                      <p className="mb-6 text-slate-600">
                        {state.payment_review
                          ? "Your payment is under review. Please contact the office before paying again."
                          : "Pay securely by card. Your progress is saved, and you’ll return here after checkout."}
                      </p>
                    )}
                    {state.appointment && (
                      <p className="mb-6 flex items-center gap-3 text-sm">
                        <CalendarDays size={18} />
                        {stamp(state.appointment.starts_at)} ·{" "}
                        {state.appointment.status}
                      </p>
                    )}
                    <div className="space-y-4">
                      {(readOnly
                        ? [
                            {
                              id: "preview",
                              title: "Booking payment",
                              amount_cents: pricing.deposit,
                              paid_cents: 0,
                              due_date: null,
                            },
                          ]
                        : state.installments
                      ).map((i) => (
                        <div
                          key={i.id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-100 p-5"
                        >
                          <div>
                            <h2 className="font-semibold">{i.title}</h2>
                            <p className="mt-1 text-sm text-slate-500">
                              {i.due_date
                                ? `Due ${i.due_date}`
                                : "Due at booking"}
                            </p>
                            <p className="mt-2 text-xl">
                              {money(
                                Math.max(0, i.amount_cents - i.paid_cents),
                              )}
                            </p>
                          </div>
                          {i.paid_cents >= i.amount_cents ? (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                              Paid
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={
                                busy ||
                                readOnly ||
                                state.payment_review ||
                                (!!config.session_slug &&
                                  state.appointment?.status !== "confirmed")
                              }
                              onClick={() =>
                                void act({
                                  action: "checkout",
                                  installment_id: i.id,
                                })
                              }
                            >
                              {busy ? "Preparing…" : "Pay securely"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn-ghost mt-5"
                        onClick={() =>
                          void refresh().catch((e) => setError(e.message))
                        }
                      >
                        Refresh payment status
                      </button>
                    )}
                    <p className="mt-5 text-xs text-slate-500">
                      Payment is confirmed after Stripe verifies receipt. A
                      checkout return alone does not mark an invoice paid.
                    </p>
                  </>
                )}
              </>
            )}
          </section>
          <aside className="h-fit rounded-3xl bg-ocean-950 p-6 text-white lg:sticky lg:top-8">
            <p className="text-xs uppercase tracking-[.16em] text-ocean-200">
              Your project
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              {context.project_name}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Prepared for {context.client_name}
            </p>
            <div className="my-6 border-t border-white/15 pt-6">
              <p className="font-medium">{pricing.selected.title}</p>
              {pricing.extras.map((a) => (
                <p key={a.id} className="mt-2 text-sm text-slate-300">
                  + {a.title}
                </p>
              ))}
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{money(pricing.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Tax</dt>
                  <dd>{money(pricing.tax)}</dd>
                </div>
                <div className="flex justify-between border-t border-white/15 pt-3 text-lg font-semibold">
                  <dt>Total</dt>
                  <dd>{money(pricing.total)}</dd>
                </div>
              </dl>
            </div>
            <p className="text-sm">
              {paidDeposit ? "Booking payment received" : `${money(pricing.deposit)} to complete booking`}
            </p>
            {pricing.balance > 0 && (
              <p className="mt-2 text-xs text-slate-300">
                {money(pricing.balance)} remaining, due {config.balance_days}{" "}
                days after signing.
              </p>
            )}
            <button
              type="button"
              className="mt-6 flex items-center gap-2 text-sm underline underline-offset-4"
              onClick={() => window.print()}
            >
              <Printer size={15} />
              Print / Save PDF
            </button>
            <a
              href="mailto:info@oceanoblue.net"
              className="mt-4 block text-sm text-slate-300 underline"
            >
              Questions? Contact our office
            </a>
          </aside>
        </div>
      </div>
      <article className="smart-print mx-auto hidden max-w-3xl space-y-6 bg-white p-8">
        <h1 className="text-3xl font-semibold">
          {mergeText(doc.title, context)}
        </h1>
        <p>
          Oceano Blue Media · {context.client_name} · {context.project_name}
        </p>
        <SmartFileDocument
          document={{ ...doc, blocks: content }}
          context={context}
        />
        <h2 className="text-xl font-semibold">Selected services</h2>
        <p>
          {pricing.selected.title}: {money(pricing.selected.price_cents)}
        </p>
        {pricing.extras.map((a) => (
          <p key={a.id}>
            {a.title}: {money(a.price_cents)}
          </p>
        ))}
        <p>
          Tax: {money(pricing.tax)} · Total: {money(pricing.total)} · Booking
          payment: {money(pricing.deposit)}
        </p>
        {pricing.balance > 0 && (
          <p>
            Balance: {money(pricing.balance)}, due {config.balance_days} days
            after signing.
          </p>
        )}
        <h2 className="text-xl font-semibold">Agreement</h2>
        <p className="whitespace-pre-wrap">
          {state.acceptance?.agreement || mergeText(config.terms, context)}
        </p>
        {Object.entries(answers).map(([k, v]) => (
          <p key={k}>
            <strong>
              {doc.blocks.find(
                (b) => b.kind === "question" && b.field.key === k,
              )?.kind === "question"
                ? doc.blocks
                    .filter((b) => b.kind === "question")
                    .find((b) => b.field.key === k)?.field.label
                : k}
              :
            </strong>{" "}
            {v}
          </p>
        ))}
        <p>{state.acceptance?.consent_text || signingConsent}</p>
        {state.acceptance ? (
          <>
            <p>
              Electronically signed by {state.acceptance.signer_name} (
              {state.acceptance.signer_email}) on {state.acceptance.accepted_at}
              .
            </p>
            <p className="break-all text-xs">
              Document SHA-256: {state.acceptance.document_hash}
            </p>
          </>
        ) : (
          <p>Unsigned preview</p>
        )}
        {state.installments.map((i) => (
          <p key={i.id}>
            {i.title}: {money(i.amount_cents)} · Paid: {money(i.paid_cents)} ·
            Due: {i.due_date}
          </p>
        ))}
      </article>
    </main>
  );
}
