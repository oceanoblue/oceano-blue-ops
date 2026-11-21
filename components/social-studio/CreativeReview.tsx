"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Item } from "@/lib/social/server";

export function CreativeReview({ item, onSaved, disabled }: { item: Item; onSaved: () => void; disabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function attach(file: File) {
    setBusy(true);
    setMessage("Uploading…");
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
    } catch (e) { setMessage(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  const href = `/api/social/creative/${item.id}?revision=${item.review_revision}`;
  return <div className="grid gap-2 sm:col-span-2">
    <span className="label">Creative for this revision</span>
    {item.creative_path && <a href={href} target="_blank" rel="noreferrer" className="text-sm font-semibold text-ocean-700 underline">Open the saved creative</a>}
    {!["scheduled", "published"].includes(item.status) && <label className="text-sm">Attach a final image or video (up to 200 MB).
      <input className="input mt-1" aria-label="Upload final creative" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" disabled={disabled || busy}
        onChange={e => { if (e.target.files?.[0]) void attach(e.target.files[0]); }} /></label>}
    <p role="status" className="text-sm">{message}</p>
  </div>;
}
