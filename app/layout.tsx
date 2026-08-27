import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Archivo, Space_Mono } from 'next/font/google';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['opsz'],
});
const sans = Archivo({
  subsets: ['latin'],
  variable: '--font-sans',
});
const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Oceano Blue — Production OS',
  description:
    'The Oceano Blue Media operating system: bookings, AI photo and video production, podcasts, and client delivery.',
  // Installable app (realtor portal): manifest + iOS home-screen treatment.
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Oceano Blue',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#0c1624',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
