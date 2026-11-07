import { describe, it, expect, vi, afterEach } from 'vitest';
import { errorHandler } from '../src/middleware/errorHandler.js';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('répond 500 avec un message générique, sans détail de l\'erreur', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = { method: 'POST', path: '/api/orders' };
    const res = mockRes();

    errorHandler(new Error('boom interne'), req, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Erreur interne du serveur.' });
    errorSpy.mockRestore();
  });

  it('journalise la méthode/route/message, jamais le corps de la requête (PII potentielle)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = { method: 'POST', path: '/api/orders', body: { phone: '0612345678' } };
    const res = mockRes();

    errorHandler(new Error('boom interne'), req, res, () => {});

    const loggedCalls = errorSpy.mock.calls.map((args) => args.join(' '));
    expect(loggedCalls.some((line) => line.includes('boom interne'))).toBe(true);
    expect(loggedCalls.some((line) => line.includes('0612345678'))).toBe(false);
  });

  it('ne journalise pas la pile en production', () => {
    process.env.NODE_ENV = 'production';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('boom'), { method: 'GET', path: '/x' }, mockRes(), () => {});
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
