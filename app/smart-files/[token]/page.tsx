import { notFound } from "next/navigation";
import { publicFile } from "@/lib/crm/acquisition-server";
import { SmartFileClient } from "@/components/crm/SmartFileClient";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your project file · Oceano Blue",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let file;
  try {
    file = await publicFile(token);
  } catch {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-3xl text-ink-950">
          Your file is temporarily unavailable
        </h1>
        <p className="mt-4 text-slate-600">
          Please retry shortly or contact{" "}
          <a className="underline" href="mailto:info@oceanoblue.net">
            info@oceanoblue.net
          </a>
          .
        </p>
      </main>
    );
  }
  if (!file) notFound();
  return (
    <SmartFileClient
      key={token}
      token={token}
      document={file.document}
      context={file.context}
      responded={!!file.responded_at}
      readOnly={process.env.VERCEL_ENV !== "production"}
    />
  );
}
