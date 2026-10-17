import { notFound } from "next/navigation";
import { crmDb } from "@/lib/crm/server";
import { InquiryForm } from "@/components/crm/InquiryForm";
import { z } from "zod";
import { fieldSchema } from "@/lib/crm/types";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Start a project · Oceano Blue",
  robots: { index: false, follow: false },
};
export default async function InquiryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: form, error } = await crmDb()
    .from("crm_forms")
    .select("slug,title,description,fields")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error)
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">
          We’re temporarily unavailable
        </h1>
        <p className="mt-3">
          Please retry shortly or contact info@oceanoblue.net.
        </p>
      </main>
    );
  if (!form) notFound();
  return (
    <main className="mx-auto max-w-3xl p-5 sm:p-10">
      <InquiryForm
        slug={form.slug}
        title={form.title}
        description={form.description}
        fields={z.array(fieldSchema).parse(form.fields)}
        readOnly={process.env.VERCEL_ENV !== "production"}
      />
    </main>
  );
}
