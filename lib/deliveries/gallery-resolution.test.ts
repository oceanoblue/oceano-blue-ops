import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PhotoDownloadControls, photoDownloadUrl } from '@/components/gallery/PhotoDownloadControls';
import { ClientGallery, type GalleryData } from '@/components/gallery/ClientGallery';

// Only unrelated gallery sections are stubbed. The resolution controls and
// ClientGallery's payment/demo/empty-gallery gates are rendered for real.
vi.mock('@/components/ui/BrandLogo', () => ({ BrandLogo: () => null }));
vi.mock('@/components/marketing/MarketingLinks', () => ({ MarketingLinks: () => null }));
vi.mock('@/components/gallery/RevisionRequests', () => ({ RevisionRequests: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props, children),
}));

const props = { token: 'test-token', photoCount: 3 };
const render = (demo = false) => renderToStaticMarkup(React.createElement(PhotoDownloadControls, { ...props, demo }));

const gallery: GalleryData = {
  order: { id: 'order', order_number: 1 }, listing: null,
  photos: [{ id: 'photo', filename: 'Photo.jpg', width: 4000, height: 3000, room_type: null, url: 'https://example.test/photo.jpg' }],
  deliverables: [],
  paywall: { active: false, paid: true, price_cents: 10000, currency: 'usd' },
};

describe('two clear photo download choices', () => {
  it('offers both resolutions as visible buttons, one ZIP each', () => {
    const html = render();
    expect(html).not.toContain('<select');
    expect(html).toContain('Download Web / MLS ZIP');
    expect(html).toContain('Download High-res ZIP');
    expect(html).toContain('under 2 MB each');
    expect(html.match(/One ZIP file/g)).toHaveLength(2);
    expect(html).toContain(`href="${photoDownloadUrl(props.token, 'web')}"`);
    expect(html).toContain(`href="${photoDownloadUrl(props.token, 'full')}"`);
  });
  it('disables both downloads in sample galleries', () => {
    const html = render(true);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).not.toContain('/api/delivery/');
  });
});

describe('gallery resolution integration', () => {
  it('renders the new controls in an unlocked gallery', () => {
    const html = renderToStaticMarkup(React.createElement(ClientGallery, { token: props.token, initialData: gallery }));
    expect(html).toContain('Download Web / MLS ZIP');
    expect(html).toContain('href="/api/delivery/test-token/download"');
    expect(html).toContain('High resolution');
  });

  it('does not expose the picker or download link before payment', () => {
    const initialData = { ...gallery, paywall: { ...gallery.paywall!, active: true, paid: false } };
    const html = renderToStaticMarkup(React.createElement(ClientGallery, { token: props.token, initialData }));
    expect(html).not.toContain('name="download-resolution"');
    expect(html).not.toContain('/api/delivery/test-token/download');
    expect(html).toContain('Unlock downloads');
  });

  it('does not offer photo downloads in an empty gallery', () => {
    const html = renderToStaticMarkup(React.createElement(ClientGallery, { token: props.token, initialData: { ...gallery, photos: [] } }));
    expect(html).not.toContain('name="download-resolution"');
    expect(html).not.toContain('/api/delivery/test-token/download');
  });
});
