/**
 * Turn common media URLs into an embeddable iframe src (YouTube, Vimeo,
 * Matterport, Kuula, CloudPano). Returns null when the URL isn't a known
 * embeddable provider — the caller then shows a plain "Open" link instead of
 * an iframe. Kept dependency-free and defensive (never throws on bad input).
 */

export type EmbedKind = 'video' | 'tour_360' | 'other';

/** Vimeo's unlisted privacy hash is an access credential, not share tracking. */
function parseVimeoUrl(rawUrl: string): { url: URL; id: string; hash: string | null } | null {
  try {
    const url = new URL(rawUrl.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const match = host === 'vimeo.com'
      ? url.pathname.match(/^\/(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/)
      : host === 'player.vimeo.com'
        ? url.pathname.match(/^\/video\/(\d+)\/?$/)
        : null;
    if (!match) return null;
    const hash = url.searchParams.get('h') || match[2] || null;
    if (hash && !/^[a-zA-Z0-9]+$/.test(hash)) return null;
    return { url, id: match[1], hash };
  } catch {
    return null;
  }
}

/** The Vimeo video page (not the iframe) exposes the owner's enabled downloads.
 * Preserve the privacy hash when converting an already-embedded player URL. */
export function getVimeoPageUrl(rawUrl: string): string | null {
  const video = parseVimeoUrl(rawUrl);
  return video ? `https://vimeo.com/${video.id}${video.hash ? `/${video.hash}` : ''}` : null;
}

export function toEmbedUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(u.protocol)) return null;
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

  // Unlisted share URLs put the hash in /{id}/{hash} or ?h={hash}; the
  // player REQUIRES ?h=. Dropping it makes an otherwise valid video fail.
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const video = parseVimeoUrl(rawUrl);
    if (!video) return null;
    const embed = new URL(`https://player.vimeo.com/video/${video.id}`);
    if (video.hash) embed.searchParams.set('h', video.hash);
    // Keep existing player options, but not Vimeo's share-tracking parameters.
    // Place h first, as required by Vimeo's unlisted embed documentation.
    if (host === 'player.vimeo.com') {
      video.url.searchParams.forEach((value, key) => {
        if (key !== 'h') embed.searchParams.append(key, value);
      });
    }
    embed.hash = video.url.hash;
    return embed.toString();
  }

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
