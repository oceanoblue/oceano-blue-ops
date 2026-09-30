import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MediaRoom, type DeliverableView } from '@/components/portal/MediaRoom';
import { toEmbedUrl } from './embed';

const page = 'https://vimeo.com/987654321/abc123def0';
const player = 'https://player.vimeo.com/video/987654321?h=abc123def0';
function item(overrides: Partial<DeliverableView> = {}): DeliverableView {
  return {
    id: 'video', kind: 'video', title: 'Property video', source: 'url',
    url: `${page}?share=copy`, downloadUrl: null, embedUrl: toEmbedUrl(page),
    mime: null, filename: null, ...overrides,
  };
}
function render(items: DeliverableView[]) {
  return renderToStaticMarkup(createElement(MediaRoom, { items }));
}

describe('client video viewing and download actions', () => {
  it('renders the unlisted player and visible Vimeo actions outside it', () => {
    const html = render([item()]);
    expect(html).toContain(`src="${player}"`);
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('Watch on Vimeo');
    expect(html).toContain('Download on Vimeo');
    expect(html.match(new RegExp(`href="${page}"`, 'g'))).toHaveLength(2);
    expect(html).toContain('Choose Download below the video');
    expect(html).not.toContain('download="');
  });

  it('converts player-only source links back to a usable Vimeo page', () => {
    const html = render([item({ url: player })]);
    expect(html).toContain(`href="${page}"`);
    expect(html).not.toContain(`href="${player}"`);
  });

  it('offers Vimeo actions even when there is no embed or title', () => {
    const html = render([item({ embedUrl: null, title: null })]);
    expect(html).toContain('Watch on Vimeo');
    expect(html).toContain('Download on Vimeo');
  });

  it('uses the signed attachment URL for uploaded video downloads', () => {
    const html = render([item({ source: 'file', url: 'https://storage.test/preview',
      downloadUrl: 'https://storage.test/attachment', embedUrl: null,
      mime: 'video/mp4', filename: 'Property video.mp4' })]);
    expect(html).toContain('<video');
    expect(html).toContain('playsInline=""');
    expect(html).toContain('href="https://storage.test/attachment"');
    expect(html).toContain('download="Property video.mp4"');
    expect(html).toContain('Download video');
    expect(html).not.toContain('Download on Vimeo');
  });

  it('does not pretend a preview is a file download if signing failed', () => {
    const html = render([item({ source: 'file', url: 'https://storage.test/preview',
      downloadUrl: null, embedUrl: null, mime: 'video/mp4' })]);
    expect(html).toContain('Open video');
    expect(html).not.toContain('Download video');
  });

  it('does not invent a download link for YouTube videos', () => {
    const url = 'https://www.youtube.com/watch?v=test123';
    const html = render([item({ url, embedUrl: toEmbedUrl(url) })]);
    expect(html).toContain('Open video');
    expect(html).not.toContain('Download video');
    expect(html).not.toContain('Download on Vimeo');
  });

  it('does not expose URLs or video actions for locked items', () => {
    const html = render([item({ locked: true, downloadUrl: 'https://storage.test/secret' })]);
    expect(html).toContain('Media ready after payment');
    expect(html).not.toContain('vimeo.com');
    expect(html).not.toContain('storage.test');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('Watch on Vimeo');
    expect(html).not.toContain('Download on Vimeo');
  });

  it('keeps existing floor-plan downloads intact', () => {
    const html = render([item({ kind: 'floor_plan', source: 'file',
      url: 'https://storage.test/plan-preview', downloadUrl: 'https://storage.test/plan-file',
      embedUrl: null, mime: 'image/png', filename: 'plan.png' })]);
    expect(html).toContain('href="https://storage.test/plan-file"');
    expect(html).toContain('download="plan.png"');
    expect(html).not.toContain('Download on Vimeo');
  });
});
