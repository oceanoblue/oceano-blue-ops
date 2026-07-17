/**
 * Turn common media URLs into an embeddable iframe src (YouTube, Vimeo,
 * Matterport, Kuula, CloudPano). Returns null when the URL isn't a known
 * embeddable provider — the caller then shows a plain "Open" link instead of
 * an iframe. Kept dependency-free and defensive (never throws on bad input).
 */

export type EmbedKind = 'video' | 'tour_360' | 'other';

export function toEmbedUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube — watch?v=, youtu.be/, /shorts/, already-embed
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname.startsWith('/embed/')) return u.toString();
    const v = u.searchParams.get('v');
    if (v) return `https://www.youtube.com/embed/${v}`;
    const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
  }

  // Vimeo — vimeo.com/{id} (+ optional hash) or player.vimeo.com
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }
  if (host === 'player.vimeo.com') return u.toString();

  // Matterport — my.matterport.com/show/?m=ID or matterport.com/discover
  if (host.endsWith('matterport.com')) {
    const m = u.searchParams.get('m');
    if (m) return `https://my.matterport.com/show/?m=${m}`;
    if (u.pathname.includes('/show')) return u.toString();
  }

  // Kuula / CloudPano — their share URLs embed directly
  if (host.endsWith('kuula.co') || host.endsWith('cloudpano.com')) {
    return u.toString();
  }

  return null;
}

/** Is this uploaded/linked file an image we can render inline? */
export function isImageMime(mime?: string | null): boolean {
  return !!mime && /^image\//.test(mime);
}
export function isPdfMime(mime?: string | null): boolean {
  return mime === 'application/pdf';
}
export function isVideoMime(mime?: string | null): boolean {
  return !!mime && /^video\//.test(mime);
}
