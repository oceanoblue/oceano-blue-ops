'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type GalleryPhoto = { id: string; url: string; alt: string; group?: string };

const GROUP_LABELS: Record<string, string> = {
  exterior: 'Exterior', living: 'Living spaces', kitchen: 'Kitchen', porch: 'Porches & decks',
  pool: 'Pool & grounds', barn: 'Barn', bedroom: 'Bedrooms', bath: 'Baths', aerial: 'Aerials', still: 'From the film',
};
const INITIAL = 14;

/** Photo grid with chapters (derived from "NN-group.jpg" file names when present) and a keyboard-friendly lightbox. */
export function PropertyGallery({ photos, headline }: { photos: GalleryPhoto[]; headline: string }) {
  const chapters = useMemo(() => {
    const seen: string[] = [];
    for (const p of photos) if (p.group && !seen.includes(p.group)) seen.push(p.group);
    return seen.length > 1 ? seen : [];
  }, [photos]);
  const [chapter, setChapter] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const shown = useMemo(() => (chapter ? photos.filter(p => p.group === chapter) : photos), [photos, chapter]);
  const visible = expanded || chapter ? shown : shown.slice(0, INITIAL);

  const step = useCallback((d: number) => setOpen(i => (i === null ? null : (i + d + shown.length) % shown.length)), [shown.length]);
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [open, step]);

  if (!photos.length) return null;
  return (
    <>
      <div className="ps-gallery-head">
        <h2 className="ps-h2" style={{ margin: 0 }}>Every room, every acre</h2>
        {chapters.length > 0 && (
          <div className="ps-chapters" role="group" aria-label="Photo chapters">
            <button type="button" aria-pressed={chapter === ''} onClick={() => setChapter('')}>All {photos.length}</button>
            {chapters.map(c => <button key={c} type="button" aria-pressed={chapter === c} onClick={() => setChapter(c)}>{GROUP_LABELS[c] || c}</button>)}
          </div>
        )}
      </div>
      <div className="ps-grid">
        {visible.map((p, i) => (
          <button key={p.id} type="button" data-property-photo={p.id} className={i % 7 === 0 ? 'ps-wide' : ''} onClick={() => setOpen(shown.indexOf(p))} aria-label={`Open photo ${shown.indexOf(p) + 1} of ${shown.length}`}>
            <img src={p.url} alt={p.alt} loading={i < 4 ? 'eager' : 'lazy'} decoding="async" />
          </button>
        ))}
      </div>
      {!expanded && !chapter && shown.length > INITIAL && (
        <div className="ps-more"><button type="button" className="ps-btn ps-btn-oxblood" onClick={() => setExpanded(true)}>See all {shown.length} photos</button></div>
      )}
      {open !== null && shown[open] && (
        <div className="ps-lightbox" role="dialog" aria-modal="true" aria-label={`${headline} photo viewer`}>
          <div className="ps-lightbox-bar">
            <span>{open + 1} / {shown.length}{shown[open].group ? ` — ${GROUP_LABELS[shown[open].group!] || shown[open].group}` : ''}</span>
            <button type="button" className="ps-icon-btn" onClick={() => setOpen(null)} autoFocus>Close</button>
          </div>
          <div className="ps-lightbox-stage" onClick={() => setOpen(null)}>
            <img src={shown[open].url} alt={shown[open].alt} onClick={e => e.stopPropagation()} />
          </div>
          <div className="ps-lightbox-nav">
            <button type="button" className="ps-icon-btn" onClick={() => step(-1)} aria-label="Previous photo">←</button>
            <button type="button" className="ps-icon-btn" onClick={() => step(1)} aria-label="Next photo">→</button>
          </div>
        </div>
      )}
    </>
  );
}
