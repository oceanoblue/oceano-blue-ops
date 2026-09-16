import type { Metadata } from 'next';

const title = 'Book a Shoot | Oceano Blue Media';
const description =
  'Book professional real estate photography and video with Oceano Blue Media.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: 'Oceano Blue Media',
    type: 'website',
  },
  twitter: { card: 'summary', title, description },
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
