import { describe, expect, it } from 'vitest';
import { parsePickerResponse, youtubeFrameCandidates } from './frame-picker';

describe('youtubeFrameCandidates', () => {
  it('prefers the maxres frame and falls back to hq for the same index', () => {
    expect(youtubeFrameCandidates('vdCbp1gkXuA', 2)).toEqual([
      'https://i.ytimg.com/vi/vdCbp1gkXuA/maxres2.jpg',
      'https://i.ytimg.com/vi/vdCbp1gkXuA/hq2.jpg',
    ]);
  });

  it('never uses hq720 / maxresdefault (they serve our own thumbnail back)', () => {
    for (const i of [1, 2, 3]) {
      for (const url of youtubeFrameCandidates('abc123def45', i)) {
        expect(url).not.toMatch(/hq720|maxresdefault/);
      }
    }
  });
});

describe('parsePickerResponse', () => {
  it('accepts valid picks, including numeric strings', () => {
    const r = parsePickerResponse({ hosts_frame: 1, guest_frame: '3', guest_remote: true, notes: 'ok' }, 3);
    expect(r).toEqual({ hosts_frame: 1, guest_frame: 3, guest_remote: true, notes: 'ok' });
  });

  it('nulls out-of-range or malformed indexes instead of guessing', () => {
    const r = parsePickerResponse({ hosts_frame: 0, guest_frame: 7, guest_remote: 'nope', notes: 42 }, 3);
    expect(r).toEqual({ hosts_frame: null, guest_frame: null, guest_remote: false, notes: '' });
  });

  it('tolerates a non-object answer', () => {
    expect(parsePickerResponse(null, 3).hosts_frame).toBeNull();
    expect(parsePickerResponse('garbage', 3).guest_frame).toBeNull();
  });

  it('caps runaway notes', () => {
    const r = parsePickerResponse({ notes: 'x'.repeat(2000) }, 3);
    expect(r.notes).toHaveLength(500);
  });
});
