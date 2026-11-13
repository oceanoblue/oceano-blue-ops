import type { Metadata } from "next";
import { SocialOnboarding } from "@/components/social/SocialOnboarding";

const title = "Start your social media | Oceano Blue Media";
const description =
  "Everything Oceano Blue Media needs to start managing your social media: account access, your brand and your files.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  openGraph: { title, description, siteName: "Oceano Blue Media", type: "website" },
};

export default function SocialStartPage() {
  return <SocialOnboarding readOnly={process.env.VERCEL_ENV !== "production"} />;
}
