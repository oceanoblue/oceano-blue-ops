"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Shapes,
  Upload,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import {
  ABOUT_QUESTIONS,
  ACCESS_EMAIL,
  ACCESS_STATES,
  ALL_QUESTIONS,
  BRAND_QUESTIONS,
  CONTENT_QUESTIONS,
  MAX_FILES,
  OFFICE_PHONE,
  PLATFORMS,
  answersSchema,
  fileKind,
  fileProblem,
  formatBytes,
  type FileKind,
  type PlatformKey,
  type Question,
} from "@/lib/social-onboarding/schema";
import { uploadSigned } from "@/lib/social-onboarding/upload";

type Platforms = Record<PlatformKey, { handle: string; access: string }>;
type Picked = {
  id: string;
  file: File;
  kind: FileKind;
  state: "ready" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};
type Phase = "form" | "sending" | "uploading" | "done" | "partial";

const GUIDES: Record<PlatformKey, { steps: string[]; note?: string }> = {
  facebook: {
    steps: [
      "On Facebook, click your profile photo in the top right and switch to your business Page.",
      "Open Settings & privacy, then Settings, then Page setup, then Page access.",
      "Next to “People with Facebook access”, click Add New.",
      `Search for ${ACCESS_EMAIL} and select the account that comes up.`,
      "Turn on “Allow this person to have full control”, click Give access, and confirm with your Facebook password.",
    ],
    note: "If your Page is managed in Meta Business Suite instead, open Settings, then People, invite the same email, and assign it your Page and Instagram account.",
  },
  instagram: {
    steps: [
      "In the Instagram app, open your profile, then the menu, then “Account type and tools”, and switch to a professional account. It's free. Skip this if you already have a Business or Creator account.",
      "Go to your profile, tap Edit profile, then Page, and connect your Facebook business Page.",
      "That's all. Once we have access to your Facebook Page, we post to Instagram through Meta's business tools.",
    ],
  },
  youtube: {
    steps: [
      "Go to studio.youtube.com, signed in as the channel owner.",
      "Click Settings in the bottom left, then Permissions.",
      `Click Invite and enter ${ACCESS_EMAIL}.`,
      "Choose the Manager role, click Done, then Save.",
    ],
    note: "The invitation is good for 30 days. If YouTube asks you to move permissions from a Brand Account first, follow that prompt and then repeat these steps.",
  },
};

const STEPS = [
  { id: "details", title: "Your details" },
  { id: "access", title: "Account access" },
  { id: "brand", title: "Brand and content" },
  { id: "files", title: "Your files" },
] as const;

const KIND_ICON: Record<FileKind, typeof FileText> = {
  image: ImageIcon,
  video: Film,
  document: FileText,
  design: Shapes,
};

const emptyPlatforms = (): Platforms => ({
  facebook: { handle: "", access: "" },
  instagram: { handle: "", access: "" },
  youtube: { handle: "", access: "" },
});

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

export function SocialOnboarding({ readOnly = false }: { readOnly?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [platforms, setPlatforms] = useState<Platforms>(emptyPlatforms);
  const [files, setFiles] = useState<Picked[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [copied, setCopied] = useState(false);
  // One id and one upload secret per visit, so a retry lands on the same intake.
  const session = useRef<{ id: string; token: string } | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  // Mirrors `files` so adding more files never reads a stale list.
  const filesRef = useRef<Picked[]>([]);

  const locked = phase !== "form";
  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };

  const onDrop = useCallback((accepted: File[]) => {
    const problems: string[] = [];
    const next = [...filesRef.current];
    for (const file of accepted) {
      const problem = fileProblem(file.name, file.size);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        continue;
      }
      if (next.some((f) => f.file.name === file.name && f.file.size === file.size))
        continue;
      if (next.length >= MAX_FILES) {
        problems.push(
          `${file.name}: you can add up to ${MAX_FILES} files here. Share a folder link for the rest.`,
        );
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        kind: fileKind(file.name)!,
        state: "ready",
        progress: 0,
      });
    }
    filesRef.current = next;
    setFiles(next);
    setRejected([...new Set(problems)]);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: locked && phase !== "partial",
    multiple: true,
  });

  const stepDone = useMemo(
    () => ({
      details: ABOUT_QUESTIONS.filter((q) => q.required).every((q) => values[q.key]?.trim()),
      access: PLATFORMS.every((p) => platforms[p.key].access),
      brand: [...BRAND_QUESTIONS, ...CONTENT_QUESTIONS]
        .filter((q) => q.required)
        .every((q) => values[q.key]?.trim()),
      files: files.length > 0 || Boolean(values.library_link?.trim()),
    }),
    [values, platforms, files],
  );

  const updateFiles = (change: (list: Picked[]) => Picked[]) => {
    filesRef.current = change(filesRef.current);
    setFiles(filesRef.current);
  };
  const patchFile = (id: string, patch: Partial<Picked>) =>
    updateFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  async function uploadAll(list: Picked[]) {
    const s = session.current!;
    let failed = 0;
    for (const item of list) {
      if (item.state === "done") continue;
      patchFile(item.id, { state: "uploading", progress: 0, error: undefined });
      try {
        const signed = await postJson("/api/social-onboarding/files", {
          action: "sign",
          submission_id: s.id,
          upload_token: s.token,
          file_id: item.id,
          name: item.file.name,
          size: item.file.size,
          content_type: item.file.type,
        });
        if (!signed.already_uploaded) {
          await uploadSigned(item.file, signed, (progress) =>
            patchFile(item.id, { progress }),
          );
          await postJson("/api/social-onboarding/files", {
            action: "done",
            submission_id: s.id,
            upload_token: s.token,
            file_id: item.id,
          });
        }
        patchFile(item.id, { state: "done", progress: 1 });
      } catch (e) {
        failed++;
        patchFile(item.id, {
          state: "error",
          error: e instanceof Error ? e.message : "Upload failed.",
        });
      }
    }
    setPhase(failed ? "partial" : "done");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || phase === "sending" || phase === "uploading") return;
    if (phase === "partial") {
      setPhase("uploading");
      await uploadAll(filesRef.current);
      return;
    }
    setFormError("");
    const blank = Object.fromEntries(ALL_QUESTIONS.map((q) => [q.key, ""]));
    const parsed = answersSchema.safeParse({ ...blank, ...values, platforms });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setFormError("A few answers need another look before you send.");
      const first = Object.keys(next)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    session.current ??= { id: crypto.randomUUID(), token: randomToken() };
    setPhase("sending");
    try {
      await postJson("/api/social-onboarding", {
        submission_id: session.current.id,
        upload_token: session.current.token,
        company_site: honeypot.current?.value || "",
        expected_files: files.length,
        answers: parsed.data,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Please try again.");
      setPhase("form");
      return;
    }
    if (!files.length) {
      setPhase("done");
      return;
    }
    setPhase("uploading");
    await uploadAll(filesRef.current);
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(ACCESS_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the address is on screen to copy by hand.
    }
  }

  const firstName = values.contact_name?.trim().split(/\s+/)[0];
  const uploadedCount = files.filter((f) => f.state === "done").length;
  const failedCount = files.filter((f) => f.state === "error").length;

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      <header className="relative overflow-hidden bg-ink-950 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-56 h-[38rem] w-[38rem] rounded-full bg-ocean-600/25 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-10">
          <BrandLogo variant="white" className="h-8 w-auto sm:h-9" />
          <div className="mt-14 grid gap-12 sm:mt-20 lg:grid-cols-[1.35fr_1fr] lg:items-end">
            <div>
              <h1 className="font-display text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                A few things from you, then we take it from here.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
                This is everything Oceano Blue Media needs to start running your
                social media. It takes about ten minutes, and you never have to
                share a password.
              </p>
            </div>
            <ol className="divide-y divide-white/10 border-y border-white/10 text-ink-100">
              {STEPS.map((step, i) => (
                <li key={step.id}>
                  <a
                    href={`#${step.id}`}
                    className="flex items-baseline gap-4 py-3.5 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-400"
                  >
                    <span className="font-display text-xl text-ocean-300">{i + 1}</span>
                    <span className="text-base">{step.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </header>

      <form onSubmit={submit} noValidate className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[15rem_1fr] lg:gap-16">
          <nav aria-label="Progress" className="hidden lg:block">
            <ol className="sticky top-10 space-y-1">
              {STEPS.map((step, i) => {
                const done = stepDone[step.id];
                return (
                  <li key={step.id}>
                    <a
                      href={`#${step.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-ink-600 hover:bg-white hover:text-ink-950 focus-visible:outline-2 focus-visible:outline-ocean-500"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${done ? "bg-ocean-600 text-white" : "bg-white text-ink-500 ring-1 ring-ink-200"}`}
                      >
                        {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                      </span>
                      <span className={done ? "text-ink-950" : undefined}>{step.title}</span>
                      <span className="sr-only">{done ? "(ready)" : "(not finished)"}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="min-w-0 space-y-14 sm:space-y-20">
            {readOnly && (
              <p className="rounded-xl bg-ocean-50 p-4 text-sm text-ocean-900 ring-1 ring-ocean-200">
                This is a preview. Sending and uploads only work on the live page.
              </p>
            )}
            <div aria-hidden="true" className="hidden">
              <label>
                Company site
                <input ref={honeypot} name="company_site" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <Section id="details" number={1} title="Your details" lead="So we know who this is and which package to set up.">
              <fieldset disabled={locked} className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
                {ABOUT_QUESTIONS.map((q) => (
                  <Field key={q.key} q={q} value={values[q.key] || ""} error={errors[q.key]} onChange={set} />
                ))}
              </fieldset>
            </Section>

            <Section
              id="access"
              number={2}
              title="Account access"
              lead="Add us to each account so we can post for you. You stay the owner and can remove us at any time."
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-ink-950 px-5 py-4 text-white">
                <p className="text-sm text-ink-200">The email to invite on every account</p>
                <p className="font-mono text-base sm:text-lg">{ACCESS_EMAIL}</p>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-3.5 text-sm font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-400"
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  <span aria-live="polite">{copied ? "Copied" : "Copy email"}</span>
                </button>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-600">
                Menus move around now and then. If yours looks different from the
                steps below, choose “I need help with this” and we&apos;ll walk you
                through it on a quick call.
              </p>
              <fieldset disabled={locked} className="mt-6 space-y-4">
                {PLATFORMS.map((p) => (
                  <div key={p.key} className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink-100 sm:p-6">
                    <h3 className="font-display text-xl text-ink-950">{p.label}</h3>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-ink-800">
                        Link or handle
                        <input
                          className="input mt-1.5"
                          value={platforms[p.key].handle}
                          placeholder={p.placeholder}
                          maxLength={300}
                          onChange={(e) =>
                            setPlatforms((v) => ({ ...v, [p.key]: { ...v[p.key], handle: e.target.value } }))
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium text-ink-800">
                        Where are you with access?
                        <select
                          className="input mt-1.5"
                          value={platforms[p.key].access}
                          onChange={(e) =>
                            setPlatforms((v) => ({ ...v, [p.key]: { ...v[p.key], access: e.target.value } }))
                          }
                        >
                          <option value="">Choose one</option>
                          {ACCESS_STATES.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <details className="group mt-5 border-t border-ink-100 pt-4">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ocean-700 hover:text-ocean-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-500 [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                        How to add us on {p.label === "Facebook Page" ? "Facebook" : p.label}
                      </summary>
                      <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-ink-700 marker:text-ink-400">
                        {GUIDES[p.key].steps.map((s) => (
                          <li key={s} className="pl-1">{s}</li>
                        ))}
                      </ol>
                      {GUIDES[p.key].note && (
                        <p className="mt-3 text-sm leading-relaxed text-ink-500">{GUIDES[p.key].note}</p>
                      )}
                    </details>
                  </div>
                ))}
                <label className="block text-sm font-medium text-ink-800">
                  Other accounts you&apos;d like us to manage
                  <span className="mt-1 block font-normal text-ink-500">
                    TikTok, LinkedIn, Google Business Profile. Add the links and we&apos;ll send access steps for each.
                  </span>
                  <textarea
                    className="input mt-1.5"
                    rows={2}
                    maxLength={1000}
                    value={values.other_accounts || ""}
                    onChange={(e) => set("other_accounts", e.target.value)}
                  />
                </label>
              </fieldset>
            </Section>

            <Section
              id="brand"
              number={3}
              title="Brand and content"
              lead="Short answers are fine. If you don't have a brand guide, we'll build your look from your logo and these answers."
            >
              <fieldset disabled={locked} className="space-y-10">
                <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
                  {BRAND_QUESTIONS.map((q) => (
                    <Field key={q.key} q={q} value={values[q.key] || ""} error={errors[q.key]} onChange={set} />
                  ))}
                </div>
                <div className="grid gap-x-5 gap-y-6 border-t border-ink-200 pt-10 sm:grid-cols-2">
                  {CONTENT_QUESTIONS.filter((q) => q.key !== "library_link").map((q) => (
                    <Field key={q.key} q={q} value={values[q.key] || ""} error={errors[q.key]} onChange={set} />
                  ))}
                </div>
              </fieldset>
            </Section>

            <Section
              id="files"
              number={4}
              title="Your files"
              lead="Send what you have. Nothing here has to be perfect."
            >
              <ul className="grid list-disc gap-x-10 gap-y-2 pl-5 text-sm leading-relaxed text-ink-700 marker:text-ocean-600 sm:grid-cols-2">
                <li>Your logo, in the best version you have (AI, EPS, SVG, PDF or PNG)</li>
                <li>Brand guide, fonts and color references</li>
                <li>Headshots and team photos</li>
                <li>Photos and videos of your work, listings or location</li>
                <li>Flyers, brochures or ads you&apos;ve already made</li>
                <li>Anything else you want us to post from</li>
              </ul>

              <div
                {...getRootProps()}
                className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-500 ${isDragActive ? "border-ocean-500 bg-ocean-50" : "border-ink-300 bg-white hover:border-ocean-400"} ${locked && phase !== "partial" ? "pointer-events-none opacity-60" : ""}`}
              >
                <input {...getInputProps()} aria-label="Upload your files" />
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-950 text-white">
                  <Upload className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-4 font-display text-2xl text-ink-950">
                  {isDragActive ? "Drop them here" : "Upload your files"}
                </p>
                <p className="mt-2 text-sm text-ink-600">
                  Drag files here or click to choose them. Up to {MAX_FILES} files, 2 GB each.
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Images, videos, PDFs, design files, fonts and ZIP folders
                </p>
              </div>

              {rejected.length > 0 && (
                <ul role="alert" className="mt-4 space-y-1 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
                  {rejected.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}

              {files.length > 0 && (
                <ul className="mt-4 divide-y divide-ink-100 rounded-2xl bg-white shadow-soft ring-1 ring-ink-100">
                  {files.map((f) => {
                    const Icon = KIND_ICON[f.kind];
                    return (
                      <li key={f.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <Icon className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">{f.file.name}</p>
                          {f.state === "uploading" ? (
                            <div
                              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100"
                              role="progressbar"
                              aria-label={`Uploading ${f.file.name}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(f.progress * 100)}
                            >
                              <div className="h-full rounded-full bg-ocean-600 transition-[width]" style={{ width: `${Math.max(4, f.progress * 100)}%` }} />
                            </div>
                          ) : (
                            <p className={`text-xs ${f.state === "error" ? "text-rose-700" : "text-ink-500"}`}>
                              {f.state === "error" ? f.error : formatBytes(f.file.size)}
                            </p>
                          )}
                        </div>
                        {f.state === "done" && <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Uploaded" />}
                        {f.state === "uploading" && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-ocean-600" aria-hidden="true" />}
                        {f.state === "error" && <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />}
                        {(f.state === "ready" || (f.state === "error" && phase === "partial")) && (
                          <button
                            type="button"
                            onClick={() => updateFiles((list) => list.filter((x) => x.id !== f.id))}
                            aria-label={`Remove ${f.file.name}`}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-ocean-500"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <fieldset disabled={locked} className="mt-8">
                <Field
                  q={CONTENT_QUESTIONS.find((q) => q.key === "library_link")!}
                  value={values.library_link || ""}
                  error={errors.library_link}
                  onChange={set}
                />
              </fieldset>
            </Section>

            <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink-100 sm:p-8" aria-live="polite">
              {phase === "done" ? (
                <div role="status">
                  <h2 className="font-display text-3xl text-ink-950">
                    Thank you{firstName ? `, ${firstName}` : ""}. We have everything.
                  </h2>
                  <p className="mt-3 max-w-2xl leading-relaxed text-ink-700">
                    {uploadedCount > 0
                      ? `Your details and ${uploadedCount} file${uploadedCount === 1 ? "" : "s"} are with our team.`
                      : "Your details are with our team."}{" "}
                    We&apos;ll review them and reach out with next steps. Questions in the
                    meantime? Email {ACCESS_EMAIL} or call {OFFICE_PHONE}.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-2xl text-ink-950 sm:text-3xl">
                    {phase === "partial" ? "Your details are saved" : "Ready to send?"}
                  </h2>
                  <p className="mt-2 max-w-2xl leading-relaxed text-ink-600">
                    {phase === "partial"
                      ? `${failedCount} file${failedCount === 1 ? "" : "s"} didn't finish uploading. Try again, or remove ${failedCount === 1 ? "it" : "them"} and email ${failedCount === 1 ? "it" : "them"} to ${ACCESS_EMAIL}.`
                      : phase === "uploading"
                        ? `Uploading your files (${uploadedCount} of ${files.length}). Keep this page open until it finishes.`
                        : "You can send this now and email anything you're missing later. We only use these details to manage your social media."}
                  </p>
                  {formError && (
                    <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-rose-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {formError}
                    </p>
                  )}
                  <button
                    disabled={readOnly || phase === "sending" || phase === "uploading"}
                    className="btn-primary mt-6 min-h-12 w-full px-6 text-base sm:w-auto"
                  >
                    {(phase === "sending" || phase === "uploading") && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    )}
                    {phase === "sending"
                      ? "Sending your details"
                      : phase === "uploading"
                        ? "Uploading your files"
                        : phase === "partial"
                          ? "Try the upload again"
                          : "Send to Oceano Blue Media"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>

      <section className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <h2 className="font-display text-3xl text-ink-950 sm:text-4xl">What happens after you send this</h2>
          <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["We confirm access", "We check that we can reach each account and help with any that need it."],
              ["We set your look", "Post designs in your colors and fonts, built from your brand guide or created for you."],
              ["We plan and post", "Your content goes out on a steady schedule, with your approval the way you asked for it."],
              ["You get a monthly report", "Views and clicks for every post, so we can make more of what's working."],
            ].map(([title, body], i) => (
              <li key={title} className="border-t-2 border-ink-950 pt-4">
                <p className="font-display text-2xl text-ocean-700">{i + 1}</p>
                <h3 className="mt-2 text-base font-semibold text-ink-950">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="bg-ink-950 text-ink-300">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandLogo variant="white" className="h-6 w-auto" />
          <p>
            <a className="underline-offset-4 hover:text-white hover:underline" href={`mailto:${ACCESS_EMAIL}`}>{ACCESS_EMAIL}</a>
            <span className="mx-3 text-ink-600" aria-hidden="true">|</span>
            <a className="underline-offset-4 hover:text-white hover:underline" href={`tel:${OFFICE_PHONE.replace(/\D/g, "")}`}>{OFFICE_PHONE}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  number,
  title,
  lead,
  children,
}: {
  id: string;
  number: number;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8">
      <div className="mb-7 flex items-baseline gap-4 border-b border-ink-200 pb-5">
        <span className="font-display text-4xl leading-none text-ocean-700 sm:text-5xl" aria-hidden="true">
          {number}
        </span>
        <div>
          <h2 id={`${id}-title`} className="font-display text-3xl leading-tight text-ink-950 sm:text-4xl">
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl leading-relaxed text-ink-600">{lead}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  q,
  value,
  error,
  onChange,
}: {
  q: Question;
  value: string;
  error?: string;
  onChange: (key: string, value: string) => void;
}) {
  const id = `f-${q.key}`;
  const shared = {
    id,
    value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : q.hint ? `${id}-hint` : undefined,
    className: `input mt-1.5 ${error ? "border-rose-400" : ""}`,
  };
  return (
    <div className={q.wide || q.type === "textarea" ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {q.label}
        {!q.required && <span className="ml-1.5 font-normal text-ink-400">optional</span>}
      </label>
      {q.hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-500">
          {q.hint}
        </p>
      )}
      {q.type === "textarea" ? (
        <textarea {...shared} rows={3} maxLength={4000} placeholder={q.placeholder} onChange={(e) => onChange(q.key, e.target.value)} />
      ) : q.type === "select" ? (
        <select {...shared} onChange={(e) => onChange(q.key, e.target.value)}>
          <option value="">Choose one</option>
          {q.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={q.type}
          maxLength={q.type === "email" ? 254 : 500}
          placeholder={q.placeholder}
          autoComplete={
            q.key === "email" ? "email" : q.key === "contact_name" ? "name" : q.key === "phone" ? "tel" : q.key === "business_name" ? "organization" : undefined
          }
          onChange={(e) => onChange(q.key, e.target.value)}
        />
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
