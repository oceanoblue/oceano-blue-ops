"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import {
  ACCESS_LABEL,
  ACCESS_STATUSES,
  KIND_LABEL,
  MEDIA_HEALTH_LABEL,
  MEDIA_HEALTH_PILL,
  MEDIA_SOURCES,
  MEDIA_SOURCE_LABEL,
  PILLAR_LABEL,
  PLATFORMS,
  PLATFORM_LABEL,
  REQUEST_LABEL,
  REQUEST_STATUSES,
  STATUS_LABEL,
  STATUS_PILL,
  TIERS,
  TIER_LABEL,
  isLate,
  shortDate,
  type AccessStatus,
  type MediaHealth,
  type MediaSource,
  type Platform,
  type ProfileLinks,
  type RequestStatus,
  type Tier,
} from "@/lib/social/schema";
import type { Account, Item, MediaBatch, MediaRequest, Member } from "@/lib/social/server";
import { ItemEditor } from "./ItemEditor";
import { useSocialAction } from "./useSocialAction";

const Out = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-ocean-700 hover:underline">
    {children} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
  </a>
);

/** The month's pieces for one account. */
export function AccountItems({ items, account, team, today }: { items: Item[]; account: Account; team: Member[]; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const editing = open ? items.find((i) => i.id === open) : undefined;
  const nameOf = new Map(team.map((m) => [m.id, m.full_name]));
  return (
    <>
      <ul className="divide-y divide-ink-100">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => setOpen(item.id)} className="grid w-full items-center gap-2 px-5 py-3 text-left hover:bg-ink-50/70 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]">
              <span className={`text-sm tabular-nums ${isLate(item, today) ? "font-semibold text-rose-700" : "text-slate-600"}`}>
                {shortDate(item.scheduled_for)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900">{item.title || `${KIND_LABEL[item.kind]}: ${PILLAR_LABEL[item.pillar]}`}</span>
                <span className="block truncate text-xs text-slate-500">
                  {KIND_LABEL[item.kind]} · {PILLAR_LABEL[item.pillar]} · {item.assignee ? nameOf.get(item.assignee) ?? "Assigned" : "Not assigned"}
                </span>
              </span>
              <span className={`pill justify-self-start ${STATUS_PILL[item.status]}`}>{STATUS_LABEL[item.status]}</span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">Nothing planned for this month yet. Plan the month from the overview.</li>}
      </ul>
      {editing && <ItemEditor key={editing.id} item={editing} accountName={account.name} brandKitUrl={account.brand_kit_url} team={team} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Account profile: quota, platforms and profile links, Canva brand kit, media folder, voice and access. */
export function AccountProfile({ account }: { account: Account }) {
  const { run, busy, error } = useSocialAction();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: account.name,
    tier: account.tier,
    platforms: account.platforms,
    posts_per_month: account.posts_per_month,
    reels_per_month: account.reels_per_month,
    google_posts_per_month: account.google_posts_per_month,
    profile_links: account.profile_links as ProfileLinks,
    brand_kit_url: account.brand_kit_url,
    media_folder_url: account.media_folder_url,
    voice_notes: account.voice_notes,
    access_status: account.access_status,
    access_note: account.access_note,
    is_active: account.is_active,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const toggle = (p: Platform) =>
    set("platforms", form.platforms.includes(p) ? form.platforms.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || form.platforms.includes(x)));
  const quota = (key: "posts_per_month" | "reels_per_month" | "google_posts_per_month", label: string, max: number) => (
    <label>
      <span className="label">{label}</span>
      <input type="number" min={0} max={max} className="input" value={form[key]} onChange={(e) => set(key, Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
    </label>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Keep links only for the platforms this account is on, and drop blanks.
    const profile_links = Object.fromEntries(
      form.platforms.map((p) => [p, (form.profile_links[p] ?? "").trim()] as const).filter(([, v]) => v),
    );
    if (await run({ action: "update_account", id: account.id, patch: { ...form, profile_links } })) setSaved(true);
  }

  return (
    <form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-6">
      <label className="sm:col-span-4">
        <span className="label">Account name</span>
        <input className="input" required maxLength={160} value={form.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Type</span>
        <select className="input" value={form.tier} onChange={(e) => set("tier", e.target.value as Tier)}>
          {TIERS.map((t) => (
            <option key={t} value={t}>{TIER_LABEL[t]}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-4 sm:col-span-6">
        {quota("posts_per_month", "Posts a month", 60)}
        {quota("reels_per_month", "Reels a month", 20)}
        {quota("google_posts_per_month", "Google posts a month", 20)}
      </div>
      <fieldset className="sm:col-span-6">
        <legend className="label">Platforms and profile links</legend>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label key={p} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${form.platforms.includes(p) ? "bg-ocean-50 text-ocean-900 ring-ocean-300" : "bg-white text-slate-600 ring-ink-200"}`}>
              <input type="checkbox" checked={form.platforms.includes(p)} onChange={() => toggle(p)} />
              {PLATFORM_LABEL[p]}
            </label>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {form.platforms.map((p) => (
            <label key={p}>
              <span className="label flex items-center justify-between">
                {PLATFORM_LABEL[p]} profile
                {account.profile_links[p] && <a href={account.profile_links[p]} target="_blank" rel="noreferrer" className="normal-case tracking-normal text-ocean-700 hover:underline">Open</a>}
              </span>
              <input type="url" className="input" maxLength={500} placeholder="https://" value={form.profile_links[p] ?? ""} onChange={(e) => set("profile_links", { ...form.profile_links, [p]: e.target.value })} />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="sm:col-span-3">
        <span className="label">Canva brand kit link</span>
        <input type="url" className="input" maxLength={500} placeholder="https://www.canva.com/..." value={form.brand_kit_url} onChange={(e) => set("brand_kit_url", e.target.value)} />
      </label>
      <label className="sm:col-span-3">
        <span className="label">Media folder link</span>
        <input type="url" className="input" maxLength={500} placeholder="Canva, Dropbox or Google Drive folder" value={form.media_folder_url} onChange={(e) => set("media_folder_url", e.target.value)} />
      </label>
      <label className="sm:col-span-6">
        <span className="label">Voice and style notes</span>
        <textarea className="input min-h-24" maxLength={4000} value={form.voice_notes} onChange={(e) => set("voice_notes", e.target.value)} placeholder="Tone, hashtags, what to avoid, flag brand rules" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Account access</span>
        <select className="input" value={form.access_status} onChange={(e) => set("access_status", e.target.value as AccessStatus)}>
          {ACCESS_STATUSES.map((s) => (
            <option key={s} value={s}>{ACCESS_LABEL[s]}</option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-4">
        <span className="label">Access note</span>
        <input className="input" maxLength={500} value={form.access_note} onChange={(e) => set("access_note", e.target.value)} placeholder="For example: Instagram needs reconnecting" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-6">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Active (included when planning a month)
        </label>
        <div className="flex items-center gap-3">
          <p role="status" className={`text-sm ${error ? "text-rose-700" : "text-emerald-700"}`}>{error || (saved ? "Saved." : "")}</p>
          <button className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save account"}</button>
        </div>
      </div>
    </form>
  );
}

/** What media has arrived, and a form to log a new batch. */
export function MediaLog({ account, media, health, today }: { account: Account; media: MediaBatch[]; health: MediaHealth; today: string }) {
  const { run, busy, error } = useSocialAction();
  const blank = { received_on: today, source: "client_visit" as MediaSource, photos: 0, videos: 0, link: "", note: "" };
  const [form, setForm] = useState(blank);
  const number = (key: "photos" | "videos", label: string, max: number) => (
    <label>
      <span className="label">{label}</span>
      <input type="number" min={0} max={max} className="input" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))) }))} />
    </label>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <span className={`pill ${MEDIA_HEALTH_PILL[health]}`}>{MEDIA_HEALTH_LABEL[health]}</span>
        {account.media_folder_url && <Out href={account.media_folder_url}>Open media folder</Out>}
      </div>
      <form
        className="grid gap-3 p-5 sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ action: "add_media", account_id: account.id, ...form })) setForm(blank);
        }}
      >
        <label>
          <span className="label">Received</span>
          <input type="date" required className="input" max={today} value={form.received_on} onChange={(e) => setForm((f) => ({ ...f, received_on: e.target.value }))} />
        </label>
        <label>
          <span className="label">From</span>
          <select className="input" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as MediaSource }))}>
            {MEDIA_SOURCES.map((s) => (
              <option key={s} value={s}>{MEDIA_SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        {number("photos", "Photos", 2000)}
        {number("videos", "Video clips", 500)}
        <label className="sm:col-span-2">
          <span className="label">Link to the files</span>
          <input type="url" className="input" maxLength={500} placeholder="https://" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Note</span>
          <input className="input" maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-4">
          <button className="btn-secondary" disabled={busy || form.photos + form.videos === 0}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Log media
          </button>
          <p role="alert" className="text-sm text-rose-700">{error}</p>
        </div>
      </form>
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {media.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
            <span className="text-slate-700">
              <span className="font-medium text-ink-900">{shortDate(m.received_on)}</span> · {m.photos} photos, {m.videos} clips · {MEDIA_SOURCE_LABEL[m.source]}
              {m.note && <span className="text-slate-500"> · {m.note}</span>}
            </span>
            {m.link && <Out href={m.link}>Files</Out>}
          </li>
        ))}
        {media.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No media logged yet.</li>}
      </ul>
    </div>
  );
}

/** Media we have asked the client for. */
export function MediaRequests({ account, requests }: { account: Account; requests: MediaRequest[] }) {
  const { run, busy, error } = useSocialAction();
  const [ask, setAsk] = useState("");
  const [due, setDue] = useState("");
  return (
    <div>
      <form
        className="grid gap-3 p-5 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ action: "add_request", account_id: account.id, ask, due_on: due || null })) {
            setAsk("");
            setDue("");
          }
        }}
      >
        <label>
          <span className="label">What we need</span>
          <input className="input" required maxLength={500} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="For example: 4 short clips of the new lobby" />
        </label>
        <label>
          <span className="label">Needed by</span>
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <button className="btn-secondary" disabled={busy || !ask.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add request
        </button>
      </form>
      <p role="alert" className="px-5 text-sm text-rose-700">{error}</p>
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
            <span className={`min-w-0 text-sm ${r.status === "received" || r.status === "cancelled" ? "text-slate-400 line-through" : "text-ink-900"}`}>
              {r.ask}
              {r.due_on && <span className="text-slate-500"> · by {shortDate(r.due_on)}</span>}
            </span>
            <select className="input w-auto" aria-label="Request status" value={r.status} disabled={busy} onChange={(e) => run({ action: "update_request", id: r.id, status: e.target.value as RequestStatus })}>
              {REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>{REQUEST_LABEL[s]}</option>
              ))}
            </select>
          </li>
        ))}
        {requests.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No requests yet.</li>}
      </ul>
    </div>
  );
}
