import { describe, expect, it } from 'vitest';
import { buildPickOutput, parsePickerResponse, youtubeFrameCandidates } from './frame-picker';

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

describe('buildPickOutput', () => {
  const picked = { result: { hosts_frame: 7, guest_frame: 3, guest_remote: false, notes: 'ok' }, model: 'gpt-5.4' };

  it('reports the video source, folder and links', () => {
    const out = buildPickOutput({
      picked,
      frameSource: 'video',
      framesConsidered: 12,
      hostsReferenceUsed: true,
      hostsUrl: 'https://dl/h.jpg',
      guestUrl: 'https://dl/g.jpg',
      framesFolder: '/Podcasts/mind-your-health/Thumbnails/frames/ep',
    });
    expect(out).toEqual({
      hosts_frame: 7,
      guest_frame: 3,
      guest_remote: false,
      notes: 'ok',
      hosts_frame_url: 'https://dl/h.jpg',
      guest_frame_url: 'https://dl/g.jpg',
      hosts_reference_used: true,
      frames_considered: 12,
      model: 'gpt-5.4',
      frame_source: 'video',
      frames_folder: '/Podcasts/mind-your-health/Thumbnails/frames/ep',
    });
  });

  it('appends an upload-failure note without touching the picks', () => {
    const out = buildPickOutput({
      picked,
      frameSource: 'video',
      framesConsidered: 12,
      hostsReferenceUsed: true,
      hostsUrl: null,
      guestUrl: 'https://dl/g.jpg',
      framesFolder: '/f',
      noteSuffix: ' (upload failed: dropbox_upload_409: path/conflict)',
    });
    expect(out.hosts_frame).toBe(7);
    expect(out.hosts_frame_url).toBeNull();
    expect(out.notes).toBe('ok (upload failed: dropbox_upload_409: path/conflict)');
  });

  it('is the v1 "picker unavailable" shape on a miss', () => {
    const out = buildPickOutput({ picked: null, frameSource: 'youtube', framesConsidered: 3, hostsReferenceUsed: false, hostsUrl: null, guestUrl: null, framesFolder: null });
    expect(out).toMatchObject({ hosts_frame: null, guest_frame: null, guest_remote: false, notes: 'Picker unavailable.', model: null, frame_source: 'youtube', frames_folder: null });
  });

  it('says so when there were no frames at all', () => {
    const out = buildPickOutput({ picked: null, frameSource: 'youtube', framesConsidered: 0, hostsReferenceUsed: true, hostsUrl: null, guestUrl: null, framesFolder: null });
    expect(out.notes).toBe('No video frames available yet.');
  });
});
