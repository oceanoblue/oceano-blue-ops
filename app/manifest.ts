import type { MetadataRoute } from 'next';

/**
 * Web app manifest — makes the app installable ("Add to Home Screen") so
 * realtors AND photographers get an Oceano Blue icon that opens full-screen.
 * Entry point is /portal: signed-out it's the magic-link/code sign-in; signed-in
 * it routes by identity (lib/auth/home-for-user) — a client lands on their
 * listings, a contractor photographer on their shoots, staff on the dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Oceano Blue',
    short_name: 'Oceano Blue',
    description:
      'Book real estate photo & video shoots, track your orders, and download finished media. Photographers: your shoots, uploads, and calendar.',
    id: '/portal',
    start_url: '/portal',
    scope: '/',
    display: 'standalone',
    background_color: '#0c1624',
    theme_color: '#0c1624',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
