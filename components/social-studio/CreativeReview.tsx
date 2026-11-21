"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { officeCreativeHref } from "@/lib/social/links";
import type { Item } from "@/lib/social/server";

/** The final image or video for a piece: see it, replace it, or add one. */
export function CreativeReview({ item, onSaved, disabled }: { item: Item; onSaved: () => void; disabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function attach(file: File) {
    setBusy(true);
    setMessage("Uploading...");
    const route = `/api/social/creative/${item.id}`;
    const request = async (body: unknown) => {
      const res = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to upload the creative.");
      return data;
    };
    try {
      const start = await request({ action: "upload", type: file.type, size: file.size });
      const result = await createClient().storage.from(start.bucket).uploadToSignedUrl(start.path, start.token, file, { upsert: false, contentType: file.type });
      if (result.error) throw new Error("The upload did not finish. Select the file to try again.");
      await request({ action: "attach", upload_id: start.upload_id, revision: item.review_revision });
      router.refresh();
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  const href = officeCreativeHref(item.id, item.review_revision ?? 1);
  const locked = ["scheduled", "published"].includes(item.status);
  const isImage = !!item.creative_type?.startsWith("image/");
  return (
    <div className="sm:col-span-2">
      <span className="label">Final image or video</span>
      <div className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-ink-200 sm:flex-row sm:items-center">
        {item.creative_path ? (
          <a href={href} target="_blank" rel="noreferrer" className="block shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200" aria-label="Open the saved creative">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={href} alt="" className="h-28 w-28 object-cover" />
            ) : (
              <video src={href} muted playsInline preload="metadata" className="h-28 w-28 object-cover" />
            )}
          </a>
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-slate-400 ring-1 ring-dashed ring-ink-200">
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1 text-sm">
          {item.creative_path ? (
            <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-ocean-700 underline">
              Open full size <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-slate-600">No file yet. Clients who approve posts need one to review. For clients who let us decide, it is optional but keeps the record complete.</p>
          )}
          {!locked && (
            <label className="mt-2 block">
              <span className="text-slate-600">{item.creative_path ? "Replace it" : "Add it"} (JPG, PNG, WebP, MP4 or MOV, up to 200 MB)</span>
              <input
                className="input mt-1"
                aria-label="Upload final creative"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                disabled={disabled || busy}
                onChange={(e) => {
                  if (e.target.files?.[0]) void attach(e.target.files[0]);
                }}
              />
            </label>
          )}
          {locked && <p className="mt-1 text-slate-500">Locked because this piece is {item.status === "published" ? "live" : "scheduled"}.</p>}
          {disabled && !locked && <p className="mt-1 text-slate-500">Save your changes before adding a file.</p>}
          <p role="status" className="mt-1 min-h-5 text-slate-700">{message}</p>
        </div>
      </div>
    </div>
  );
}
