import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'office-user' } } }) },
    rpc: async () => ({ data: true }),
  }),
  createAdminClient: () => ({
    from: () => ({
      update: (columns: unknown) => {
        mocks.update(columns);
        return { eq: () => ({ select: async () => ({ data: [{ id: 'show' }], error: null }) }) };
      },
    }),
  }),
}));
vi.mock('@/lib/integrations/dropbox', () => ({ createShowFolder: vi.fn() }));
import { PATCH } from '@/app/api/podcasts/shows/route';

beforeEach(() => mocks.update.mockClear());
describe('podcast show partial updates', () => {
  const request = (fields: Record<string, unknown>) => new Request('https://example.test/api/podcasts/shows', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ show_id: '11111111-1111-4111-8111-111111111111', ...fields }),
  });
  it('does not reset the saved language when changing another field', async () => {
    expect((await PATCH(request({ name: 'Updated show' }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Updated show' });
  });
  it('still accepts an explicit language update', async () => {
    expect((await PATCH(request({ default_language: 'es' }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ default_language: 'es' });
  });
});
