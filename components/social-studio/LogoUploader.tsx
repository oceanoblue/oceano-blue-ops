"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import type { LogoTarget } from "@/lib/social/schema";
import { SocialLogo, type LogoSize } from "./Logo";
import { useSocialAction } from "./useSocialAction";

const MAX_BYTES = 3_000_000;

/** A file's contents as base64, without the "data:...;base64," prefix. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

/**
 * A logo you can tap to replace. Shows the logo (or the lettered tile), and
 * uploads a new image when one is chosen. For a sub-account whose brand has
 * other sub-accounts (`mates`), it then offers the same logo to them.
 */
export function LogoUploader({
  target,
  id,
  name,
  url,
  size = "lg",
  mates = [],
  brand = "",
  tone = "light",
  showActions = true,
}: {
  target: LogoTarget;
  id: string;
  name: string;
  url: string;
  size?: LogoSize;
  /** Other sub-accounts of the same brand, offered the same logo after an upload. */
  mates?: { id: string; name: string }[];
  brand?: string;
  /** "dark" when the control sits on a dark header. */
  tone?: "light" | "dark";
  /** Show the text links under the logo. Off for tight spots such as table rows. */
  showActions?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { run, busy: saving, error: actionError } = useSocialAction();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [offer, setOffer] = useState(false);
  const [shared, setShared] = useState(0);
  const busy = uploading || saving;
  const link = tone === "dark" ? "text-ocean-200 hover:text-white" : "text-ocean-700 hover:text-ocean-900";
  const muted = tone === "dark" ? "text-ink-200" : "text-slate-600";

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setShared(0);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Choose a PNG, JPEG or WebP image.");
    if (file.size > MAX_BYTES) return setError("Choose an image smaller than 3 MB.");
    setUploading(true);
    try {
      const res = await fetch("/api/social/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, id, content: await toBase64(file) }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "The logo could not be uploaded.");
      setOffer(mates.length > 0);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message !== "read" ? err.message : "The logo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function share() {
    const result = await run({ action: "share_logo", account_id: id, to: mates.map((m) => m.id) });
    if (result) {
      setShared(Number(result.updated) || 0);
      setOffer(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choose} />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="group relative shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-400 disabled:opacity-60"
        aria-label={url ? `Change the logo for ${name}` : `Add a logo for ${name}`}
        title={url ? "Change logo" : "Add a logo"}
      >
        <SocialLogo name={name} url={url} size={size} />
        <span
          aria-hidden="true"
          className={`absolute -bottom-1 -right-1 grid place-items-center rounded-full bg-white text-ocean-700 shadow-soft ring-1 ring-ink-200 transition group-hover:bg-ocean-600 group-hover:text-white ${size === "sm" || size === "md" ? "h-5 w-5" : "h-7 w-7"}`}
        >
          <Camera className={size === "sm" || size === "md" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </span>
      </button>

      {showActions && (
        <div className={`flex flex-wrap items-center gap-x-3 text-xs font-medium ${muted}`}>
          {busy ? (
            <span role="status">Working...</span>
          ) : (
            <>
              <button type="button" className={link} onClick={() => input.current?.click()}>
                {url ? "Change logo" : "Add a logo"}
              </button>
              {url && (
                <button type="button" className={link} onClick={() => run({ action: "remove_logo", target, id })}>
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      )}

      {offer && !busy && (
        <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${muted}`}>
          Use it for the {mates.length} other {brand} {mates.length === 1 ? "sub-account" : "sub-accounts"}?
          <button type="button" className={`font-semibold ${link}`} onClick={share}>
            Yes
          </button>
          <button type="button" className={`font-semibold ${link}`} onClick={() => setOffer(false)}>
            No
          </button>
        </p>
      )}
      {shared > 0 && (
        <p role="status" className={`text-xs ${tone === "dark" ? "text-emerald-300" : "text-emerald-700"}`}>
          Added to {shared} more.
        </p>
      )}
      {(error || actionError) && (
        <p role="alert" className={`max-w-56 text-xs ${tone === "dark" ? "text-rose-300" : "text-rose-700"}`}>
          {error || actionError}
        </p>
      )}
    </div>
  );
}
