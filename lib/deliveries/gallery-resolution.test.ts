import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PhotoDownloadControls, photoDownloadUrl, type DeliverySize } from '@/components/gallery/PhotoDownloadControls';
import { ClientGallery, type GalleryData } from '@/components/gallery/ClientGallery';

// Only unrelated gallery sections are stubbed. The resolution controls and
// ClientGallery's payment/demo/empty-gallery gates are rendered for real.
vi.mock('@/components/ui/BrandLogo', () => ({ BrandLogo: () => null }));
vi.mock('@/components/marketing/MarketingLinks', () => ({ MarketingLinks: () => null }));
vi.mock('@/components/gallery/RevisionRequests', () => ({ RevisionRequests: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props, children),
}));

type ElementProps = { children?: React.ReactNode; [key: string]: unknown };
function findElement(node: React.ReactNode, type: string): React.ReactElement<ElementProps> | undefined {
  if (Array.isArray(node)) return node.map(child => findElement(child, type)).find(Boolean);
  if (!React.isValidElement<ElementProps>(node)) return undefined;
  return node.type === type ? node : findElement(node.props.children, type);
}

const props = { token: 'test-token', photoCount: 3, value: 'full' as DeliverySize, onChange: vi.fn() };
const render = (value: DeliverySize, demo = false) => renderToStaticMarkup(React.createElement(PhotoDownloadControls, { ...props, value, demo }));

const gallery: GalleryData = {
  order: { id: 'order', order_number: 1 }, listing: null,
  photos: [{ id: 'photo', filename: 'Photo.jpg', width: 4000, height: 3000, room_type: null, url: 'https://example.test/photo.jpg' }],
  deliverables: [],
  paywall: { active: false, paid: true, price_cents: 10000, currency: 'usd' },
};

describe('native photo download resolution', () => {
  it.each(['full', 'print', 'web'] as const)('renders %s as the selected, enabled option with its matching download', value => {
    const html = render(value);
    expect(html).toContain('<select');
    expect(html).toContain('Download resolution');
    expect(html.match(/<option\b/g)).toHaveLength(3);
    expect(html).toMatch(new RegExp(`<option[^>]*value="${value}"[^>]*selected=""`));
    expect(html).toContain(`href="${photoDownloadUrl(props.token, value)}"`);
    expect(html).not.toContain('disabled');
    expect(html).toContain('gallery previews stay the same');
  });

  it('updates the controlled value synchronously on each native change with no blur timeout', () => {
    let value: DeliverySize = 'full';
    const onChange = vi.fn((next: DeliverySize) => { value = next; });
    for (const next of ['web', 'print', 'full', 'web'] as const) {
      const tree = PhotoDownloadControls({ ...props, value, onChange });
      const select = findElement(tree, 'select')!.props as React.SelectHTMLAttributes<HTMLSelectElement>;
      expect(select.disabled).not.toBe(true);
      expect(select.onBlur).toBeUndefined();
      select.onChange!({ currentTarget: { value: next } } as React.ChangeEvent<HTMLSelectElement>);
      expect(onChange).toHaveBeenLastCalledWith(next);
      expect(value).toBe(next);
      const updated = PhotoDownloadControls({ ...props, value, onChange });
      expect(findElement(updated, 'select')!.props.value).toBe(next);
      expect(findElement(updated, 'a')!.props.href).toBe(photoDownloadUrl(props.token, next));
    }
  });

  it('uses the existing server presets without changing full-resolution downloads', () => {
    expect(photoDownloadUrl('test-token', 'full')).toBe('/api/delivery/test-token/download');
    expect(photoDownloadUrl('test-token', 'web')).toBe('/api/delivery/test-token/download?size=web');
    expect(photoDownloadUrl('test-token', 'print')).toBe('/api/delivery/test-token/download?size=print');
    expect(photoDownloadUrl('unsafe/token?', 'web')).toContain('unsafe%2Ftoken%3F/download?size=web');
    expect(render('web')).toContain('2048 px');
    expect(render('print')).toContain('3000 px');
  });

  it('keeps the sample picker usable but never enables a demo download', () => {
    const html = render('web', true);
    expect(html).toContain('<select');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('/api/delivery/');
  });
});

describe('gallery resolution integration', () => {
  it('renders the new controls in an unlocked gallery', () => {
    const html = renderToStaticMarkup(React.createElement(ClientGallery, { token: props.token, initialData: gallery }));
    expect(html).toContain('name="download-resolution"');
    expect(html).toContain('href="/api/delivery/test-token/download"');
    expect(html).toContain('Web resolution');
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
