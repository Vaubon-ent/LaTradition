import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  onUnauthorized,
  checkSession,
  login,
  logout,
  adminFetch,
  fetchOrders,
  updateOrderStatus,
  saveOrdersExport,
} from '../admin/js/adminApi.js';

function mockFetchOnce(status, body) {
  global.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

beforeEach(() => {
  delete global.window?.API_BASE;
  onUnauthorized(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adminApi', () => {
  it('checkSession resolves on 200', async () => {
    mockFetchOnce(200, { ok: true });
    await expect(checkSession()).resolves.toEqual({ ok: true });
  });

  it('checkSession rejects with an ApiError on 401', async () => {
    mockFetchOnce(401, { error: 'Jeton de session manquant.' });
    await expect(checkSession()).rejects.toMatchObject({ status: 401 });
  });

  it('login resolves on correct password', async () => {
    mockFetchOnce(200, { ok: true });
    await expect(login('secret')).resolves.toEqual({ ok: true });
  });

  it('login rejects with status 429 when locked', async () => {
    mockFetchOnce(429, { error: 'Trop de tentatives.' });
    await expect(login('secret')).rejects.toMatchObject({ status: 429 });
  });

  it('logout resolves on success', async () => {
    mockFetchOnce(200, { ok: true });
    await expect(logout()).resolves.toEqual({ ok: true });
  });

  it('adminFetch appelle le handler enregistré en cas de 401', async () => {
    mockFetchOnce(401, { error: 'Jeton de session invalide ou expiré.' });
    const handler = vi.fn();
    onUnauthorized(handler);

    await expect(adminFetch('/api/admin/orders')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("adminFetch n'appelle pas le handler pour une autre erreur que 401", async () => {
    mockFetchOnce(500, { error: 'Erreur serveur.' });
    const handler = vi.fn();
    onUnauthorized(handler);

    await expect(adminFetch('/api/admin/orders')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fetchOrders appelle GET /api/admin/orders', async () => {
    mockFetchOnce(200, { orders: [] });
    await expect(fetchOrders()).resolves.toEqual({ orders: [] });
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/orders');
  });

  it('updateOrderStatus envoie un PATCH avec le statut demandé', async () => {
    mockFetchOnce(200, { ok: true });
    await expect(updateOrderStatus(42, 'retiree')).resolves.toEqual({ ok: true });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/admin/orders/42/status');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ status: 'retiree' });
  });

  it('saveOrdersExport envoie un POST vers /api/admin/export/save', async () => {
    mockFetchOnce(200, { ok: true, path: 'data/exports/commandes-2026.xlsx' });
    await expect(saveOrdersExport()).resolves.toEqual({ ok: true, path: 'data/exports/commandes-2026.xlsx' });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/admin/export/save');
    expect(options.method).toBe('POST');
  });
});
