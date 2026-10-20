"use client";
import { useState } from "react";
export function SmartFileImageUpload({
  onUpload,
}: {
  onUpload: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <label className="block text-sm">
        Upload a portfolio photo
        <input
          type="file"
          className="mt-2 block w-full text-sm"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            if (file.size > 3000000) {
              setError("Choose a photo smaller than 3 MB.");
              return;
            }
            setBusy(true);
            try {
              const content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = () =>
                  reject(new Error("Could not read this photo."));
                reader.readAsDataURL(file);
              });
              const r = await fetch("/api/crm/acquisition/images", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                }),
                b = await r.json();
              if (!r.ok) throw new Error(b.error);
              onUpload(b.url);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">
        {busy
          ? "Uploading…"
          : "JPEG, PNG or WebP, up to 3 MB. Uploaded portfolio images use public URLs. Do not upload confidential documents."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
