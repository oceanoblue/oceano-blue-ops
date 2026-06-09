import { describe, it, expect } from 'vitest';
import { advancesEpisodeStatus } from './constants';

describe('advancesEpisodeStatus', () => {
  it('moves forward along the pipeline', () => {
    expect(advancesEpisodeStatus('ingested', 'transcribed')).toBe(true);
    expect(advancesEpisodeStatus('transcribed', 'needs_review')).toBe(true);
    expect(advancesEpisodeStatus('needs_review', 'ready_to_publish')).toBe(true);
    expect(advancesEpisodeStatus('ready_to_publish', 'published')).toBe(true);
  });

  it('never moves backwards on replayed events (the re-run bug)', () => {
    expect(advancesEpisodeStatus('needs_review', 'transcribed')).toBe(false);
    expect(advancesEpisodeStatus('ready_to_publish', 'needs_review')).toBe(false);
    expect(advancesEpisodeStatus('published', 'ready_to_publish')).toBe(false);
  });

  it('is not advanced by a duplicate of the current status', () => {
    expect(advancesEpisodeStatus('transcribed', 'transcribed')).toBe(false);
  });

  it('lets a pipeline re-run resume after a human rejection', () => {
    expect(advancesEpisodeStatus('needs_revision', 'transcribed')).toBe(true);
    expect(advancesEpisodeStatus('needs_revision', 'ready_to_publish')).toBe(true);
  });

  it('never resurrects archived/cancelled episodes', () => {
    expect(advancesEpisodeStatus('archived', 'published')).toBe(false);
    expect(advancesEpisodeStatus('cancelled', 'transcribed')).toBe(false);
  });

  it('refuses unknown target statuses', () => {
    expect(advancesEpisodeStatus('ingested', 'needs_revision')).toBe(false);
    expect(advancesEpisodeStatus('ingested', 'bogus')).toBe(false);
  });

  it('handles null/unknown current status', () => {
    expect(advancesEpisodeStatus(null, 'transcribed')).toBe(true);
    expect(advancesEpisodeStatus(undefined, 'published')).toBe(true);
  });
});
