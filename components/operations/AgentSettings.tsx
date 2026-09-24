"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Loader2, RefreshCw } from "lucide-react";
import {
  AGENT_LABELS,
  AGENT_ROLES,
  type AgentSettings as Settings,
  type Provider,
} from "@/lib/operations/types";

export function AgentSettings({
  initial,
  available,
  providers,
}: {
  initial: Settings;
  available: boolean;
  providers: { openai: boolean; anthropic: boolean };
}) {
  const [settings, setSettings] = useState(initial);
  const [models, setModels] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  const [loading, setLoading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  async function refresh(provider: "openai" | "anthropic") {
    setLoading(provider);
    setError("");
    try {
      const r = await fetch(`/api/operations/models?provider=${provider}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setModels((m) => ({ ...m, [provider]: d.models }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load models.");
    } finally {
      setLoading(null);
    }
  }
  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/operations/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNotice("Saved. Your next daily run uses these settings.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      id="agents"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-950">
            <Bot className="h-5 w-5 text-blue-600" />
            Your assistants
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose who does the thinking. Keep control of what goes out.
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
          Draft and recommend
        </span>
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {AGENT_ROLES.map((role) => {
          const choice = settings.agents[role];
          return (
            <div
              key={role}
              className="min-w-0 rounded-xl border border-slate-200 p-4"
            >
              <h3 className="font-semibold text-ink-900">
                {AGENT_LABELS[role]}
              </h3>
              <p className="mt-1 min-h-10 text-sm text-slate-500">
                {role === "planner"
                  ? "Priorities, commitments, and conflicts."
                  : role === "handoff"
                    ? "Editor instructions and missing information."
                    : "Overdue work, review queues, and follow-ups."}
              </p>
              <label
                className="mt-4 block text-sm font-medium text-slate-600"
                htmlFor={`${role}-provider`}
              >
                Provider
              </label>
              <select
                id={`${role}-provider`}
                className="input mt-1 w-full"
                value={choice.provider}
                disabled={!available || saving}
                onChange={(e) => {
                  const provider = e.target.value as Provider;
                  setNotice("");
                  setSettings((s) => ({
                    ...s,
                    agents: { ...s.agents, [role]: { provider, model: "" } },
                  }));
                  if (provider !== "rules" && !models[provider])
                    void refresh(provider);
                }}
              >
                <option value="rules">Built-in operations rules</option>
                <option value="openai" disabled={!providers.openai}>
                  OpenAI{!providers.openai ? " · API key needed" : ""}
                </option>
                <option value="anthropic" disabled={!providers.anthropic}>
                  Claude{!providers.anthropic ? " · API key needed" : ""}
                </option>
              </select>
              {choice.provider !== "rules" && (
                <>
                  <div className="mt-3 flex items-center justify-between">
                    <label
                      htmlFor={`${role}-model`}
                      className="text-sm font-medium text-slate-600"
                    >
                      Model
                    </label>
                    <button
                      type="button"
                      aria-label={`Refresh ${choice.provider} models`}
                      disabled={!!loading}
                      onClick={() =>
                        void refresh(choice.provider as "openai" | "anthropic")
                      }
                      className="rounded p-2 text-blue-600 hover:bg-blue-50"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${loading === choice.provider ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                  <select
                    id={`${role}-model`}
                    className="input w-full"
                    value={choice.model}
                    disabled={
                      !available || saving || loading === choice.provider
                    }
                    onChange={(e) => {
                      setNotice("");
                      setSettings((s) => ({
                        ...s,
                        agents: {
                          ...s.agents,
                          [role]: { ...choice, model: e.target.value },
                        },
                      }));
                    }}
                  >
                    <option value="">Choose an available model</option>
                    {choice.model &&
                      !models[choice.provider]?.some(
                        (m) => m.id === choice.model,
                      ) && (
                        <option value={choice.model}>
                          {choice.model} (saved)
                        </option>
                      )}
                    {models[choice.provider]?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-5 grid items-end gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="h-5 w-5 accent-blue-600"
            checked={settings.enabled}
            disabled={!available || saving}
            onChange={(e) => {
              setNotice("");
              setSettings((s) => ({ ...s, enabled: e.target.checked }));
            }}
          />
          Run automatically every day
        </label>
        <label className="block text-sm font-medium">
          Morning brief at
          <input
            aria-label="Morning brief time"
            type="time"
            className="input mt-1 w-full"
            value={settings.brief_time}
            disabled={!available || saving}
            onChange={(e) => {
              setNotice("");
              setSettings((s) => ({ ...s, brief_time: e.target.value }));
            }}
          />
        </label>
        <label className="block text-sm font-medium">
          Timezone
          <select
            className="input mt-1 w-full"
            value={settings.timezone}
            disabled={!available || saving}
            onChange={(e) => {
              setNotice("");
              setSettings((s) => ({ ...s, timezone: e.target.value }));
            }}
          >
            {Array.from(
              new Set([
                settings.timezone,
                "America/New_York",
                "America/Chicago",
                "America/Denver",
                "America/Los_Angeles",
                "UTC",
              ]),
            ).map((tz) => (
              <option key={tz} value={tz}>
                {tz.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">
        Runs within 15 minutes of your chosen time, including weekends, after
        production deployment. Built-in rules have no AI usage charges. AI
        assistants use separately billed OpenAI or Anthropic APIs and can read
        the calendar, production facts, and connected Gmail previews in your briefing. Only the day planner receives email previews. They prepare drafts;
        they do not send messages or change commitments. Briefing history is kept for seven days in the active database; summaries can contain private details.
      </p>
      <details className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">
          Connections and API setup
        </summary>
        <div className="mt-3 space-y-2 text-slate-600">
          <p>
            Google Calendar and Gmail connect through{" "}
            <a
              href="/dashboard/settings/integrations"
              className="text-blue-700 underline"
            >
              your integration settings
            </a>
            . Each person connects their own primary calendar.
          </p>
          <p>
            OpenAI:{" "}
            <strong>
              {providers.openai
                ? "Server credential present"
                : "API key needed"}
            </strong>
            . Claude:{" "}
            <strong>
              {providers.anthropic
                ? "Server credential present"
                : "API key needed"}
            </strong>
            .
          </p>
          <p>
            Add <code>OPENAI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, and{" "}
            <code>CRON_SECRET</code> as server environment variables in the
            existing Vercel project. Never paste keys into a job or prompt.
            Refresh the model list to verify access.
          </p>
          <p>
            Your ChatGPT and Claude chat subscriptions do not supply API credits
            or import chat history. Model availability is checked against the
            configured API account.
          </p>
        </div>
      </details>
      {!available && (
        <p role="alert" className="mt-4 text-sm text-amber-800">
          Apply the operations database migration to save settings and scheduled
          briefs.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 text-sm text-emerald-700"
        >
          <Check className="h-4 w-4" />
          {notice}
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !available}
          className="btn-primary min-h-11 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Save assistant settings"}
        </button>
      </div>
    </section>
  );
}
