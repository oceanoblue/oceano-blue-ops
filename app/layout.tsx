import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Archivo, Space_Mono } from 'next/font/google';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz', 'SOFT', 'WONK'],
});

const grotesk = Archivo({
  subsets: ['latin'],
  variable: '--font-grotesk',
  display: 'swap',
});

const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
});

const SITE_URL = 'https://oceanoblue.net';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Oceano Blue Media — Cinematic Video & Photography | Bluffton, SC',
    template: '%s | Oceano Blue Media',
  },
  description:
    'A cinematic video production & photography studio in Old Town Bluffton. Brand films, photography, headshots, real estate, and a podcast studio — crafted for the Lowcountry and beyond.',
  keywords: [
    'video production Bluffton SC',
    'Lowcountry videographer',
    'brand photography',
    'real estate photography',
    'headshots',
    'podcast studio',
    'Hilton Head video production',
  ],
  openGraph: {
    title: 'Oceano Blue Media — Cinematic Video & Photography',
    description:
      'Brand films, photography, headshots, real estate, and a podcast studio. Old Town Bluffton, the Lowcountry & beyond.',
    url: SITE_URL,
    siteName: 'Oceano Blue Media',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Oceano Blue Media — Cinematic Video & Photography',
    description:
      'Brand films, photography, headshots, real estate, and a podcast studio in the Lowcountry.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${grotesk.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
