import { describe, expect, it } from 'vitest';
import { DEFAULT_FINISH, FinishSchema, FINISH_STYLES, imageEditSize } from './finishing';
import { createEnhanceRecipe, recipeFromParams } from './recipe';
import { withCorrection } from './rerun-resolve';
import { buildAutoEnhanceJobRow } from './auto-enhance';

describe('shared finishing recipes', () => {
  it('uses Sunburst and bright strong windows by default on manual and automatic paths', () => {
    const manual = createEnhanceRecipe('openai-gpt-image');
    const auto = buildAutoEnhanceJobRow({ orderId: 'order', baseId: 'photo', providerId: 'openai-gpt-image', createdBy: null, sceneFixes: false });
    expect(manual.model).toBe('gpt-image-2.5-sunburst');
    expect(auto.params.recipe.finish).toEqual(manual.finish);
    expect(manual.finish).toMatchObject({ style: 'bright_listing', windows: 'strong' });
    expect(auto.params.auto_chain_fixes).toBe(false);
    expect(auto.params.auto_chain_scope).not.toContain('window_pull');
  });
  it.each(Object.keys(FINISH_STYLES))('persists and prompts for %s without contradictory legacy Signature text', style => {
    const finish = FinishSchema.parse({ style, scene: 'interior' });
    const recipe = createEnhanceRecipe('openai-gpt-image', {}, finish);
    expect(recipeFromParams({ recipe })?.finish).toEqual(finish);
    expect(recipe.prompt).toContain(FINISH_STYLES[finish.style].direction);
    expect(recipe.prompt).not.toContain('STRENGTH: Signature');
  });
  it('honors windows OFF even if an older toggle is true', () => {
    const recipe = createEnhanceRecipe('openai-gpt-image', { windowPull: true }, { ...DEFAULT_FINISH, windows: 'off' });
    expect(recipe.prompt).toContain('Off. Preserve existing window');
    expect(recipe.prompt).not.toContain('WINDOW PULLS:');
  });
  it('turns correction into a current-version refinement without losing the model/style snapshot', () => {
    const original = createEnhanceRecipe('openai-gpt-image');
    const fixed = withCorrection(original, 'Slightly cooler whites');
    expect(fixed.refinement).toBe(true);
    expect(fixed.model).toBe(original.model);
    expect(fixed.prompt).toContain('current finished photograph');
    expect(fixed.prompt).not.toContain('Substantially improve');
    expect(original.refinement).toBeUndefined();
  });
});

describe('source-proportion dimensions', () => {
  it.each([[6000,4000], [4000,6000], [3000,3000], [6000,2000], [4032,3024]])('preserves %sx%s', (w,h) => {
    const [ow,oh] = imageEditSize(w,h).split('x').map(Number);
    expect(Math.max(ow,oh)).toBeLessThanOrEqual(2048);
    expect(ow % 16).toBe(0); expect(oh % 16).toBe(0);
    expect(Math.abs((ow/oh)/(w/h)-1)).toBeLessThan(0.02);
  });
  it('rejects unsupported proportions instead of silently cropping', () => {
    expect(() => imageEditSize(8000,1000)).toThrow('aspect_ratio');
    expect(() => imageEditSize(0,0)).toThrow('aspect_ratio');
  });
});
