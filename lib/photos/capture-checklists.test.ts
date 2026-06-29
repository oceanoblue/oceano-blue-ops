import { describe, it, expect } from 'vitest';
import {
  CAPTURE_CHECKLISTS,
  checklistFor,
  checklistItemCount,
} from './capture-checklists';
import { PROJECT_TYPES } from './profiles';

describe('capture checklists', () => {
  it('every profile has a non-empty, well-formed checklist', () => {
    for (const pt of PROJECT_TYPES) {
      const sections = CAPTURE_CHECKLISTS[pt];
      expect(sections.length, pt).toBeGreaterThan(0);
      for (const s of sections) {
        expect(s.title.trim(), pt).not.toBe('');
        expect(s.items.length, `${pt}/${s.title}`).toBeGreaterThan(0);
        for (const it of s.items) expect(it.text.trim()).not.toBe('');
      }
    }
  });

  it('every profile defines at least one critical item', () => {
    for (const pt of PROJECT_TYPES) {
      const hasCritical = CAPTURE_CHECKLISTS[pt].some((s) => s.items.some((i) => i.critical));
      expect(hasCritical, pt).toBe(true);
    }
  });

  it('checklistFor falls back to MLS for unknown / empty project types', () => {
    expect(checklistFor('architectural')).toBe(CAPTURE_CHECKLISTS.architectural);
    expect(checklistFor(null)).toBe(CAPTURE_CHECKLISTS.mls_real_estate);
    expect(checklistFor('nonsense')).toBe(CAPTURE_CHECKLISTS.mls_real_estate);
  });

  it('checklistItemCount sums every item across sections', () => {
    const sections = [
      { title: 'A', items: [{ text: 'x' }, { text: 'y' }] },
      { title: 'B', items: [{ text: 'z' }] },
    ];
    expect(checklistItemCount(sections)).toBe(3);
    expect(checklistItemCount([])).toBe(0);
  });

  it('architectural demands plumb verticals and window-hold (its signature discipline)', () => {
    const text = CAPTURE_CHECKLISTS.architectural
      .flatMap((s) => s.items.map((i) => i.text.toLowerCase()))
      .join(' | ');
    expect(text).toMatch(/plumb|vertical/);
    expect(text).toMatch(/window/);
  });
});
