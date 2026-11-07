import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, fetchProducts, checkPhone, submitOrder } from '../js/api.js';

function mockFetchOnce(status, body) {
  global.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

beforeEach(() => {
  delete global.window?.API_BASE;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api wrappers', () => {
  it('fetchProducts resolves with the parsed body on success', async () => {
    mockFetchOnce(200, { products: [{ id: 'blanc', name: 'Boudin blanc', price_per_kg: 1000 }] });
    const result = await fetchProducts();
    expect(result.products).toHaveLength(1);
  });

  it('throws an ApiError carrying the server message on failure', async () => {
    mockFetchOnce(403, { error: 'Nonce expiré.' });
    await expect(checkPhone({ phone: '0612345678', nonce: 'x' })).rejects.toMatchObject({
      message: 'Nonce expiré.',
      status: 403,
    });
  });

  it('throws an ApiError instance', async () => {
    mockFetchOnce(400, { error: 'Requête invalide.' });
    await expect(submitOrder({ first_name: 'a', last_name: 'b', phone: 'c', items: [], nonce: 'n' })).rejects.toBeInstanceOf(
      ApiError
    );
  });

  it('falls back to a generic message when the body has no error field', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error('no body'); } }));
    await expect(fetchProducts()).rejects.toMatchObject({ status: 500 });
  });
});
