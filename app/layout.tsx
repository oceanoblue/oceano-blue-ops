import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Oceano Blue — Real Estate Photography Platform',
  description: 'Internal management for listings, orders, scheduling, AI photo processing, and delivery.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
