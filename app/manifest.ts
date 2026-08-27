import type { MetadataRoute } from 'next';

/**
 * Web app manifest — makes the client portal installable ("Add to Home
 * Screen") so realtors get an Oceano Blue app icon that opens full-screen.
 * Entry point is /portal: signed-out it's the magic-link/code sign-in,
 * signed-in it's their listings, galleries, and the Book-a-shoot flow.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Oceano Blue',
    short_name: 'Oceano Blue',
    description:
      'Book real estate photo & video shoots, track your orders, and download finished media.',
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
