import { describe, it, expect } from 'vitest';
import { safeRelativePath } from './safe-redirect';

describe('safeRelativePath', () => {
  it('allows same-site absolute paths', () => {
    expect(safeRelativePath('/dashboard', '/x')).toBe('/dashboard');
    expect(safeRelativePath('/portal/listings?tab=1', '/x')).toBe('/portal/listings?tab=1');
  });

  it('falls back for empty / missing values', () => {
    expect(safeRelativePath(null, '/home')).toBe('/home');
    expect(safeRelativePath(undefined, '/home')).toBe('/home');
    expect(safeRelativePath('', '/home')).toBe('/home');
  });

  it('rejects absolute URLs to other origins', () => {
    expect(safeRelativePath('https://evil.com', '/home')).toBe('/home');
    expect(safeRelativePath('http://evil.com/x', '/home')).toBe('/home');
  });

  it('rejects protocol-relative and backslash tricks', () => {
    expect(safeRelativePath('//evil.com', '/home')).toBe('/home');
    expect(safeRelativePath('/\\evil.com', '/home')).toBe('/home');
    expect(safeRelativePath('\\/evil.com', '/home')).toBe('/home');
  });

  it('rejects values that do not start with a slash', () => {
    expect(safeRelativePath('dashboard', '/home')).toBe('/home');
    expect(safeRelativePath('javascript:alert(1)', '/home')).toBe('/home');
  });
});
