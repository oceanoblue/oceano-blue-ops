"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Send one change to /api/social and reload the page's data when it is saved.
 * Returns the server's answer, or null when the change was not saved (the
 * reason is in `error`).
 */
export function useSocialAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async (action: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || "Unable to save.");
        router.refresh();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to save.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { run, busy, error, clearError: () => setError("") };
}
