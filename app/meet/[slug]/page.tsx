import { notFound } from "next/navigation";
import { SchedulingBooking } from "@/components/crm/SchedulingBooking";
import { publicSessionType, readSessionType } from "@/lib/crm/scheduling-server";
import { sessionSlugSchema } from "@/lib/crm/scheduling-types";
export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule a session · Oceano Blue", robots: { index: false, follow: false } };
export default async function Page({ params }: {
    params: Promise<{
        slug: string;
    }>;
}) {
    const slug = sessionSlugSchema.safeParse((await params).slug);
    if (!slug.success)
        notFound();
    let type;
    try {
        type = await readSessionType(slug.data);
    }
    catch {
        notFound();
    }
    return <SchedulingBooking type={publicSessionType(type)} readOnly={process.env.VERCEL_ENV !== "production"}/>;
}
