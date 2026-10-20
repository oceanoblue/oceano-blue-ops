"use client";
import { useEffect, useState } from "react";
import type { ExperienceBlock } from "@/lib/crm/smart-experience-types";
export function SmartExperienceEditor({
  value,
  onChange,
}: {
  value: ExperienceBlock;
  onChange: (value: ExperienceBlock) => void;
}) {
  const [types, setTypes] = useState<
      { slug: string; name: string; published: boolean }[]
    >([]),
    [calendarError, setCalendarError] = useState("");
  useEffect(() => {
    fetch("/api/crm/scheduling", { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setTypes(b.types ?? []);
      })
      .catch(() =>
        setCalendarError(
          "Calendar list unavailable. Verify the session in Scheduling links before sending.",
        ),
      );
  }, []);
  const patch = (change: Partial<ExperienceBlock>) =>
    onChange({ ...value, ...change });
  return (
    <div className="space-y-5">
      <label className="block text-sm">
        Booking title
        <input
          required
          className="input mt-2"
          value={value.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>
      {(["packages", "addons"] as const).map((key) => (
        <fieldset key={key} className="space-y-3">
          <legend className="mb-3 font-semibold">
            {key === "packages"
              ? "Packages (client chooses one)"
              : "Optional extras"}
          </legend>
          {value[key].map((p, i) => (
            <div
              key={p.id}
              className="space-y-3 rounded-xl border border-ink-100 bg-white p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                <label className="text-sm">
                  Name
                  <input
                    className="input mt-1"
                    required
                    maxLength={180}
                    value={p.title}
                    onChange={(e) =>
                      patch({
                        [key]: value[key].map((a, n) =>
                          n === i ? { ...a, title: e.target.value } : a,
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Price (USD)
                  <input
                    type="number"
                    className="input mt-1"
                    required
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    value={p.price_cents / 100 || ""}
                    onChange={(e) =>
                      patch({
                        [key]: value[key].map((a, n) =>
                          n === i
                            ? {
                                ...a,
                                price_cents: Math.round(
                                  Number(e.target.value) * 100,
                                ),
                              }
                            : a,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <label className="block text-sm">
                What’s included
                <textarea
                  className="input mt-1"
                  rows={3}
                  maxLength={3000}
                  value={p.description}
                  onChange={(e) =>
                    patch({
                      [key]: value[key].map((a, n) =>
                        n === i ? { ...a, description: e.target.value } : a,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="btn-ghost text-rose-700"
                disabled={key === "packages" && value.packages.length === 1}
                onClick={() =>
                  patch({ [key]: value[key].filter((_, n) => n !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            disabled={value[key].length >= (key === "packages" ? 12 : 20)}
            onClick={() =>
              patch({
                [key]: [
                  ...value[key],
                  {
                    id: crypto.randomUUID(),
                    title: key === "packages" ? "New package" : "New extra",
                    description: "",
                    price_cents: 0,
                  },
                ],
              })
            }
          >
            Add {key === "packages" ? "package" : "extra"}
          </button>
        </fieldset>
      ))}
      <label className="block text-sm">
        Agreement text
        <textarea
          className="input mt-2"
          rows={10}
          maxLength={30000}
          placeholder="Paste your approved client agreement. Use {{client_name}} and {{project_name}} for personalization."
          value={value.terms}
          onChange={(e) => patch({ terms: e.target.value })}
        />
      </label>
      <p className="text-xs text-slate-500">
        The selected services, price breakdown, payment schedule, signature
        consent and signing time are saved with this agreement. Issued copies
        stay unchanged.
      </p>
      <label className="block text-sm">
        Session calendar
        <select
          className="input mt-2"
          value={value.session_slug}
          onChange={(e) => patch({ session_slug: e.target.value })}
        >
          <option value="">No scheduling step</option>
          {value.session_slug &&
            !types.some((t) => t.slug === value.session_slug) && (
              <option value={value.session_slug}>
                {value.session_slug} (verify availability)
              </option>
            )}
          {types.map((t) => (
            <option key={t.slug} value={t.slug} disabled={!t.published}>
              {t.name}
              {t.published ? "" : " (draft)"}
            </option>
          ))}
        </select>
      </label>
      {calendarError && (
        <p className="text-sm text-amber-800">{calendarError}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Booking payment (%)
          <input
            type="number"
            className="input mt-2"
            required
            min={1}
            max={100}
            value={value.deposit_percent}
            onChange={(e) => patch({ deposit_percent: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Balance due (days after signing)
          <input
            type="number"
            className="input mt-2"
            required
            min={1}
            max={365}
            disabled={value.deposit_percent === 100}
            value={value.balance_days}
            onChange={(e) => patch({ balance_days: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Tax (%)
          <input
            type="number"
            className="input mt-2"
            required
            min={0}
            max={25}
            step="0.01"
            value={value.tax_bps / 100}
            onChange={(e) =>
              patch({ tax_bps: Math.round(Number(e.target.value) * 100) })
            }
          />
        </label>
      </div>
      <p className="rounded-xl bg-ocean-50 p-4 text-sm text-ocean-900">
        Signing creates a new Ops invoice from these prices. Use this for new
        bookings, not projects with an existing HoneyBook payment plan. A
        reserved session stays on the calendar while payment is pending.
      </p>
    </div>
  );
}
