"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function SessionPaymentStatus({ token, title, expired, readOnly }: { token: string; title: string; expired: boolean; readOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function check(resume: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crm/scheduling/manage/${token}/payment`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.confirmed) router.refresh();
      else if (resume) window.location.assign(result.checkout_url);
      else setError("Payment has not completed yet. Continue checkout or check again shortly.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to check payment."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl"><p className="text-xs font-semibold tracking-[.16em] text-ocean-600">OCEANO BLUE MEDIA</p><h1 className="mt-5 font-display text-3xl text-ocean-950">{expired ? "Checkout expired" : "Complete your booking"}</h1><p className="mt-3 font-medium text-ocean-900">{title}</p><p className="mt-4 text-sm leading-relaxed text-slate-600">{expired ? "Your time has been released. Choose another available time to book your session." : "Your session is awaiting payment. If you just paid, check your payment status to see your confirmation. Otherwise, continue secure checkout to confirm your time."}</p>{error && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}{!expired && <div className="mt-6 flex flex-wrap gap-3"><button className="btn-primary" disabled={busy || readOnly} onClick={() => void check(true)}>Continue payment</button><button className="btn-secondary" disabled={busy || readOnly} onClick={() => void check(false)}>{busy ? "Checking…" : "Check payment status"}</button></div>}<a className="mt-6 block text-sm text-ocean-700 underline" href="/book/sessions">View photo sessions</a><p className="mt-5 text-xs text-slate-500">Need help? <a href="mailto:info@oceanoblue.net" className="underline">info@oceanoblue.net</a></p></section></main>;
}
