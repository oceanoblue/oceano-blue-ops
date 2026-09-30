import { describe, expect, it } from 'vitest';
import { getVimeoPageUrl, toEmbedUrl } from './embed';

// Synthetic values only: unlisted hashes are access credentials.
const id = '987654321';
const hash = 'abc123def0';
const player = `https://player.vimeo.com/video/${id}`;
const page = `https://vimeo.com/${id}`;

describe('Vimeo embeds', () => {
  it.each([
    `${page}/${hash}?share=copy&fl=sv&fe=ci`,
    `${page}/${hash}/`,
    `${page}?h=${hash}&share=copy`,
    `https://www.vimeo.com/${id}/${hash}`,
    `  ${page}/${hash}  `,
    `${player}?h=${hash}`,
  ])('keeps the unlisted credential for %s', url => {
    expect(toEmbedUrl(url)).toBe(`${player}?h=${hash}`);
    expect(getVimeoPageUrl(url)).toBe(`${page}/${hash}`);
  });

  it.each([page, `${page}/`, player])('supports public videos: %s', url => {
    expect(toEmbedUrl(url)).toBe(player);
    expect(getVimeoPageUrl(url)).toBe(page);
  });

  it('keeps player options and places the privacy hash first', () => {
    expect(toEmbedUrl(`${player}?autoplay=1&h=${hash}&muted=1#t=10s`))
      .toBe(`${player}?h=${hash}&autoplay=1&muted=1#t=10s`);
  });

  it('keeps a share link playback position without share tracking', () => {
    expect(toEmbedUrl(`${page}/${hash}?share=copy#t=10s`)).toBe(`${player}?h=${hash}#t=10s`);
  });

  it('normalizes an http Vimeo link to https', () => {
    expect(toEmbedUrl(`http://vimeo.com/${id}/${hash}`)).toBe(`${player}?h=${hash}`);
  });

  it.each([
    '', 'not a URL', 'javascript:alert(1)',
    `ftp://vimeo.com/${id}/${hash}`,
    `https://vimeo.com.evil.test/${id}/${hash}`,
    `https://evil.test/vimeo.com/${id}/${hash}`,
    `https://vimeo.com@evil.test/${id}/${hash}`,
    `https://user:secret@vimeo.com/${id}/${hash}`,
    `https://player.vimeo.com/other/${id}`,
    `https://vimeo.com/showcase/${id}`,
    `${page}/abc%2Fdef`, `${page}?h=abc%3Cdef`,
  ])('rejects malformed or non-video Vimeo URLs: %s', url => {
    expect(toEmbedUrl(url)).toBeNull();
    expect(getVimeoPageUrl(url)).toBeNull();
  });
});

describe('other providers', () => {
  it.each([
    ['https://www.youtube.com/watch?v=test123', 'https://www.youtube.com/embed/test123'],
    ['https://youtu.be/test123', 'https://www.youtube.com/embed/test123'],
    ['https://www.youtube.com/shorts/test123', 'https://www.youtube.com/embed/test123'],
    ['https://www.youtube.com/embed/test123', 'https://www.youtube.com/embed/test123'],
    ['https://my.matterport.com/show/?m=test123', 'https://my.matterport.com/show/?m=test123'],
    ['https://kuula.co/share/test123', 'https://kuula.co/share/test123'],
    ['https://app.cloudpano.com/tours/test123', 'https://app.cloudpano.com/tours/test123'],
  ])('preserves %s', (url, expected) => {
    expect(toEmbedUrl(url)).toBe(expected);
    expect(getVimeoPageUrl(url)).toBeNull();
  });
});
