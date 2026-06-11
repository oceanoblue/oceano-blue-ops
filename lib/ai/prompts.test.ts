import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  composeEnhanceDirections,
  LUXURY_REAL_ESTATE_BASE,
  PROMPTS,
} from './prompts';

describe('LUXURY_REAL_ESTATE_BASE', () => {
  it('encodes the signature constraints: neutral whites, no warm/cool cast, enhanced color', () => {
    expect(LUXURY_REAL_ESTATE_BASE).toMatch(/Whites must look truly white/i);
    expect(LUXURY_REAL_ESTATE_BASE).toMatch(/COLOR \(ENHANCED BUT TRUE-TO-LIFE\)/);
    expect(LUXURY_REAL_ESTATE_BASE).toMatch(/No global warm\/amber or\s+cool\/blue cast/);
  });
});

describe('composeEnhanceDirections', () => {
  it('is empty when nothing is toggled (consistent-but-enhanced default)', () => {
    expect(composeEnhanceDirections({})).toBe('');
  });

  it('does not add a sky directive for "original"', () => {
    expect(composeEnhanceDirections({ skyStyle: 'original' })).toBe('');
  });

  it('adds a concrete sky description for a preset', () => {
    const out = composeEnhanceDirections({ skyStyle: 'sunny_puffs' });
    expect(out).toMatch(/^SKY:/m);
    expect(out).toMatch(/fair-weather cumulus puffs/);
    expect(out).toMatch(/preserve the building, landscaping/i);
  });

  it('adds window-pull and perspective blocks only when enabled', () => {
    const out = composeEnhanceDirections({ windowPull: true, perspectiveCorrection: true });
    expect(out).toMatch(/^WINDOW PULLS:/m);
    expect(out).toMatch(/^PERSPECTIVE:/m);
    expect(out).not.toMatch(/^SKY:/m);
  });

  it('distinguishes Signature vs Natural strength', () => {
    expect(composeEnhanceDirections({ enhancementStyle: 'natural' })).toMatch(/Natural/);
    expect(composeEnhanceDirections({ enhancementStyle: 'signature' })).toMatch(/Signature/);
  });

  it('passes through an editor note', () => {
    expect(composeEnhanceDirections({ extra: 'warm up the fireplace' })).toMatch(
      /EDITOR NOTE: warm up the fireplace/
    );
  });
});

describe('buildPrompt', () => {
  it('returns the base job prompt when no extra is given', () => {
    expect(buildPrompt('enhance_single')).toBe(PROMPTS.enhance_single);
  });

  it('appends a plain editor note (legacy string signature)', () => {
    const out = buildPrompt('enhance_single', 'make it brighter');
    expect(out).toMatch(/Additional direction from the editor: make it brighter/);
  });

  it('appends structured directives', () => {
    const out = buildPrompt('enhance_single', { skyStyle: 'clear_fade', windowPull: true });
    expect(out.startsWith(PROMPTS.enhance_single)).toBe(true);
    expect(out).toMatch(/^SKY:/m);
    expect(out).toMatch(/^WINDOW PULLS:/m);
  });
});
