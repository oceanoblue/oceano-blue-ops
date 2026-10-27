import { expect, it, vi } from 'vitest';
import OpenAI from 'openai';

it('keeps chat requests and multipart image edits compatible with the upgraded SDK', async () => {
  const requests: Request[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    // The SDK probes native FormData support through a local data URL.
    if (request.url.startsWith('data:')) return new Response('');
    requests.push(request);
    return Response.json(request.url.endsWith('/images/edits')
      ? { data: [{ b64_json: 'aW1hZ2U=' }] }
      : { choices: [{ message: { content: 'kitchen' } }] });
  });
  const client = new OpenAI({ apiKey: 'fixture-key', baseURL: 'https://example.test/v1', fetch, maxRetries: 0 });
  const chat = await client.chat.completions.create({ model: 'fixture-model', messages: [{ role: 'user', content: 'Classify this room' }] });
  expect(chat.choices[0].message.content).toBe('kitchen');
  expect(await requests[0].json()).toMatchObject({ messages: [{ role: 'user', content: 'Classify this room' }] });
  const edit = await client.images.edit({ model: 'gpt-image-1', prompt: 'Preserve the room', image: new File(['image'], 'room.png', { type: 'image/png' }) });
  expect(edit.data?.[0].b64_json).toBe('aW1hZ2U=');
  const form = await requests[1].formData();
  expect(form.get('prompt')).toBe('Preserve the room');
  expect((form.get('image') as File).name).toBe('room.png');
  expect(requests).toHaveLength(2);
});
