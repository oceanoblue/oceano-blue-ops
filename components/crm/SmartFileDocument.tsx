import { balanceSchedule } from "@/lib/crm/smart-experience-types";
import {
  mergeText,
  type FileContext,
  type FileDocument,
} from "@/lib/crm/acquisition-types";
export function SmartFileDocument({
  document: doc,
  context,
  answers = {},
  onAnswer,
  disabled = false,
  hideQuestions = false,
}: {
  document: FileDocument;
  context: FileContext;
  answers?: Record<string, string>;
  onAnswer?: (key: string, value: string) => void;
  disabled?: boolean;
  hideQuestions?: boolean;
}) {
  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-ocean-700">
          Oceano Blue Media
        </p>
        <h1 className="mt-3 text-3xl text-ink-950 sm:text-4xl">
          {mergeText(doc.title, context)}
        </h1>
        {doc.description && (
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-slate-600">
            {mergeText(doc.description, context)}
          </p>
        )}
      </div>
      {doc.blocks.map((block) => {
        if (block.kind === "experience")
          return (
            <section
              key={block.id}
              className="space-y-3 rounded-2xl border border-ink-100 p-5"
            >
              <h2 className="text-xl">{block.title}</h2>
              {block.packages.map((p) => (
                <p key={p.id}>
                  {p.title} · ${(p.price_cents / 100).toFixed(2)}
                </p>
              ))}
              <p className="text-sm text-slate-500">
                {block.deposit_percent}% at booking
                {block.deposit_percent < 100
                  ? `; balance due ${balanceSchedule(block, context)}`
                  : ""}
                . {block.session_slug ? "Session scheduling included." : ""}
              </p>
              <details>
                <summary>Agreement</summary>
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {mergeText(block.terms, context)}
                </p>
              </details>
            </section>
          );
        if (block.kind === "image")
          return (
            <figure key={block.id} className="overflow-hidden rounded-2xl">
              <img
                src={block.url}
                alt={block.title}
                referrerPolicy="no-referrer"
                className="w-full object-cover"
                loading="lazy"
              />
              {block.body && (
                <figcaption className="mt-3 text-sm text-slate-500">
                  {block.body}
                </figcaption>
              )}
            </figure>
          );
        if (block.kind === "page")
          return (
            <section key={block.id} className="border-t border-ink-100 pt-8">
              <h2 className="text-2xl">{block.title}</h2>
              {block.body && (
                <p className="mt-3 text-slate-600">{block.body}</p>
              )}
            </section>
          );
        if (block.kind === "text")
          return (
            <section key={block.id} className="space-y-3">
              {block.title && (
                <h2 className="text-2xl text-ink-950">
                  {mergeText(block.title, context)}
                </h2>
              )}
              <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
                {mergeText(block.body, context)}
              </p>
            </section>
          );
        if (block.kind === "link")
          return (
            <section
              key={block.id}
              className="rounded-xl border border-ink-100 bg-ink-50/60 p-5"
            >
              <h2 className="text-xl text-ink-950">
                {mergeText(block.title, context)}
              </h2>
              {block.body && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {mergeText(block.body, context)}
                </p>
              )}
              <a
                href={block.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary mt-4"
              >
                Open document ↗
              </a>
            </section>
          );
        if (hideQuestions) return null;
        const f = block.field,
          id = `file-${block.id}`;
        return (
          <label key={block.id} htmlFor={id} className="block space-y-2">
            <span className="text-sm font-medium text-ink-900">
              {f.label}
              {f.required && <span className="ml-1 text-ocean-700">*</span>}
            </span>
            {f.type === "textarea" ? (
              <textarea
                id={id}
                name={f.key}
                className="input"
                rows={4}
                maxLength={10000}
                required={f.required}
                disabled={disabled}
                value={answers[f.key] ?? ""}
                onChange={(e) => onAnswer?.(f.key, e.target.value)}
              />
            ) : f.type === "select" ? (
              <select
                id={id}
                name={f.key}
                className="input"
                required={f.required}
                disabled={disabled}
                value={answers[f.key] ?? ""}
                onChange={(e) => onAnswer?.(f.key, e.target.value)}
              >
                <option value="">Choose an option</option>
                {f.options?.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={f.key}
                type={f.type}
                className="input"
                min={f.type === "number" ? 0 : undefined}
                step={f.type === "number" ? "any" : undefined}
                maxLength={500}
                required={f.required}
                disabled={disabled}
                value={answers[f.key] ?? ""}
                onChange={(e) => onAnswer?.(f.key, e.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
