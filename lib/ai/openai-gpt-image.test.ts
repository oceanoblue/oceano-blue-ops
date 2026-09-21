import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({ edit: vi.fn(), init: vi.fn() }));
vi.mock('openai', () => ({ default: class { images = { edit: mocks.edit }; constructor(opts: unknown) { mocks.init(opts); } } }));
import { openaiGptImage } from './openai-gpt-image';
import { createEnhanceRecipe } from './recipe';
import { DEFAULT_FINISH } from './finishing';
let source: Buffer;
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY','fixture-key');
  mocks.edit.mockReset(); mocks.init.mockReset();
  source = await sharp({ create: { width: 128, height: 192, channels: 3, background: '#c9a780' } }).jpeg().toBuffer();
  mocks.edit.mockResolvedValue({ data: [{ b64_json: source.toString('base64') }], usage: { input_tokens: 50, output_tokens: 20 } });
});
afterEach(() => vi.unstubAllEnvs());
const request = () => ({ jobType: 'enhance_single' as const, inputs: [{ bytes: source, filename: 'portrait.jpg', mimeType: 'image/jpeg' }], params: { recipe: createEnhanceRecipe('openai-gpt-image', {}, { ...DEFAULT_FINISH, quality: 'xhigh' }) } });
describe('Sunburst adapter', () => {
  it('sends exact model, quality, source order and portrait proportions; records usage and output format', async () => {
    const req = request(); req.inputs.push({ ...req.inputs[0], filename: 'dark.jpg' });
    const out = await openaiGptImage.process(req);
    const call = mocks.edit.mock.calls[0][0];
    expect(call).toMatchObject({ model: 'gpt-image-2.5-sunburst', quality: 'xhigh', size: '128x192', output_format: 'jpeg' });
    expect(call.image.map((f: File) => f.name)).toEqual(['portrait.jpg','dark.jpg']);
    expect(call.input_fidelity).toBeUndefined();
    expect(out.outputs[0].bytes).toEqual(source);
    expect(out.outputs[0].mimeType).toBe('image/jpeg');
    expect(out.provenance).toMatchObject({ quality: 'xhigh', usage: { input_tokens: 50 }, reviewRequired: true, fidelityGuaranteed: false });
    expect(mocks.init).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  });
  it('does not silently retry an ambiguous timeout or unsupported-size response', async () => {
    mocks.edit.mockRejectedValue(new Error('invalid size or interrupted'));
    await expect(openaiGptImage.process(request())).rejects.toThrow('invalid size');
    expect(mocks.edit).toHaveBeenCalledTimes(1);
  });
  it('rejects a landscape response for a portrait photograph', async () => {
    const landscape = await sharp(source).rotate(90).jpeg().toBuffer();
    mocks.edit.mockResolvedValue({ data: [{ b64_json: landscape.toString('base64') }] });
    await expect(openaiGptImage.process(request())).rejects.toThrow('aspect_ratio');
  });
  it('fails before spending when an input download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable',{status:403})));
    try { await expect(openaiGptImage.process({ jobType:'enhance_single', inputs:[{url:'https://example.test/photo',filename:'photo.jpg'}] })).rejects.toThrow('download_failed'); }
    finally { vi.unstubAllGlobals(); }
    expect(mocks.edit).not.toHaveBeenCalled();
  });
});
