import { expect, it, vi } from 'vitest';
import { captureError } from './report';
it('records useful database errors without copying the full response or credentials', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    captureError('database', { message: 'Schedule conflict', code: 'P0001', headers: { authorization: 'secret' } }, { orderId: 'order' });
    const row = JSON.parse(log.mock.calls[0][0]);
    expect(row).toMatchObject({ message: 'Schedule conflict', code: 'P0001', orderId: 'order' });
    expect(log.mock.calls[0][0]).not.toContain('secret');
  } finally { log.mockRestore(); }
});
