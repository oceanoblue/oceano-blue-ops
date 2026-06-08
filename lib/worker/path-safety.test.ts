import { describe, it, expect } from 'vitest';
import { isWithinRoot, safeResolveWithinRoots, mediaTypeFromExt, workerHandlesTask } from './path-safety';

describe('isWithinRoot', () => {
  it('accepts a nested relative path', () => {
    expect(isWithinRoot('/data/shoots', 'club-course/IMG_001.ARW')).toBe(true);
  });
  it('accepts the root itself', () => {
    expect(isWithinRoot('/data/shoots', '.')).toBe(true);
  });
  it('accepts an absolute path inside the root', () => {
    expect(isWithinRoot('/data/shoots', '/data/shoots/a/b.jpg')).toBe(true);
  });
  it('rejects parent traversal', () => {
    expect(isWithinRoot('/data/shoots', '../secret.txt')).toBe(false);
    expect(isWithinRoot('/data/shoots', 'a/../../etc/passwd')).toBe(false);
  });
  it('rejects an absolute path outside the root', () => {
    expect(isWithinRoot('/data/shoots', '/etc/passwd')).toBe(false);
  });
});

describe('safeResolveWithinRoots', () => {
  const roots = ['/data/shoots', '/mnt/nas/video'];
  it('resolves within the matching root', () => {
    expect(safeResolveWithinRoots(roots, '/mnt/nas/video/ep1.mov')).toBe('/mnt/nas/video/ep1.mov');
    expect(safeResolveWithinRoots(roots, 'club/IMG.ARW')).toBe('/data/shoots/club/IMG.ARW');
  });
  it('returns null when the target escapes every root', () => {
    expect(safeResolveWithinRoots(roots, '/etc/shadow')).toBeNull();
    expect(safeResolveWithinRoots(roots, '../../etc/shadow')).toBeNull();
  });
});

describe('mediaTypeFromExt', () => {
  it('classifies by extension', () => {
    expect(mediaTypeFromExt('a.ARW')).toBe('photo');
    expect(mediaTypeFromExt('a.jpg')).toBe('photo');
    expect(mediaTypeFromExt('ep.mov')).toBe('video');
    expect(mediaTypeFromExt('vo.wav')).toBe('audio');
    expect(mediaTypeFromExt('notes.txt')).toBe('other');
  });
});

describe('workerHandlesTask', () => {
  it('matches capability membership', () => {
    expect(workerHandlesTask(['scan_folder', 'generate_thumbnails'], 'scan_folder')).toBe(true);
    expect(workerHandlesTask(['scan_folder'], 'convert_raw')).toBe(false);
    expect(workerHandlesTask([], 'scan_folder')).toBe(false);
  });
});
