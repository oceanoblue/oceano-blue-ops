import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { AgreementSign } from "@/components/social/AgreementSign";
import { agreementBlocks, signatureTime } from "@/lib/social/schema";
import { publicAgreement, type PublicAgreement } from "@/lib/social/server";
import { OFFICE_PHONE } from "@/lib/social-onboarding/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your agreement | Oceano Blue Media",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Signature({ party, name, title, at }: { party: string; name: string; title: string; at: string | null }) {
  return (
    <div className="rounded-xl bg-ink-50 p-5 ring-1 ring-ink-100">
      <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">{party}</p>
      {name ? (
        <>
          <p className="mt-2 font-display text-3xl italic text-ocean-950">{name}</p>
          <p className="mt-2 text-sm text-slate-700">
            {name}
            {title && `, ${title}`}
          </p>
          <p className="text-xs text-slate-500">Signed electronically {signatureTime(at)}</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Not signed yet</p>
      )}
    </div>
  );
}

/** Where a client reads and signs an agreement, and where the signed copy lives afterwards. */
export default async function SocialAgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let agreement: PublicAgreement | null;
  try {
    agreement = await publicAgreement(token);
  } catch {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="font-display text-3xl text-ink-950">Your agreement is temporarily unavailable</h1>
        <p className="mt-4 text-slate-600">
          Please try again shortly or contact{" "}
          <a className="underline" href="mailto:info@oceanoblue.net">
            info@oceanoblue.net
          </a>
          .
        </p>
      </main>
    );
  }
  if (!agreement) notFound();

  const state =
    agreement.status === "signed"
      ? "Signed by both parties. Keep this link, or print this page to save a copy."
      : agreement.status === "client_signed"
        ? "Thank you. Your signature is saved. Oceano Blue Media will countersign, and the complete copy will stay at this link."
        : "Please read the agreement, then sign at the bottom of the page.";

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 print:bg-white">
      <header className="bg-ink-950 text-white print:bg-white print:text-ink-950">
        <div className="mx-auto max-w-4xl px-5 pb-10 pt-8 sm:px-8">
          <BrandLogo variant="white" className="h-8 w-auto print:hidden sm:h-9" />
          <p className="mt-10 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-300 print:mt-0 print:text-slate-500">
            Agreement for {agreement.client}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-5xl">{agreement.title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-200 print:text-slate-600">{state}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-5 py-10 sm:px-8">
        <article className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink-100 sm:p-10 print:p-0 print:shadow-none print:ring-0">
          {agreementBlocks(agreement.body).map((block, i) =>
            block.type === "h1" ? (
              <h2 key={i} className="mt-8 font-display text-2xl text-ocean-950 first:mt-0">{block.text}</h2>
            ) : block.type === "h2" ? (
              <h3 key={i} className="mt-7 text-base font-semibold text-ink-900 first:mt-0">{block.text}</h3>
            ) : (
              <p key={i} className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-slate-800 first:mt-0">{block.text}</p>
            ),
          )}
        </article>

        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink-100 sm:p-10 print:p-0 print:shadow-none print:ring-0">
          <h2 className="font-display text-2xl text-ocean-950">Signatures</h2>
          {agreement.status === "sent" ? (
            <div className="mt-5">
              <AgreementSign token={token} documentHash={agreement.document_hash} readOnly={process.env.VERCEL_ENV !== "production"} />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Signature party={agreement.client} name={agreement.client_name} title={agreement.client_title} at={agreement.client_signed_at} />
              <Signature party="Oceano Blue Media" name={agreement.counter_name} title={agreement.counter_title} at={agreement.countersigned_at} />
            </div>
          )}
          <p className="mt-6 break-all font-mono text-[11px] text-slate-400">Document fingerprint (SHA-256): {agreement.document_hash}</p>
        </section>

        <footer className="text-sm text-slate-500 print:hidden">
          Oceano Blue Media · 217 Goethe Rd, Unit 3B, Bluffton, SC 29910 ·{" "}
          <a className="underline" href="mailto:info@oceanoblue.net">
            info@oceanoblue.net
          </a>{" "}
          · {OFFICE_PHONE}
        </footer>
      </main>
    </div>
  );
}
