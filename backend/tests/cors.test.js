import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, TEST_ALLOWED_ORIGIN } from './helpers/testApp.js';

describe('CORS (M9)', () => {
  let db;
  afterEach(() => db?.close());

  it('autorise une requête sans en-tête Origin (curl, appel direct)', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/products');
    expect(res.status).toBe(200);
  });

  it('autorise une requête depuis l\'origine configurée et pose les en-têtes CORS', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/products').set('Origin', TEST_ALLOWED_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ALLOWED_ORIGIN);
  });

  it('refuse une requête cross-origin non autorisée', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/products').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('refuse toute requête avec Origin quand ALLOWED_ORIGIN n\'est pas configuré (bloquer par défaut)', async () => {
    const built = buildTestApp({ allowedOrigin: null });
    db = built.db;
    const res = await request(built.app).get('/api/products').set('Origin', TEST_ALLOWED_ORIGIN);
    expect(res.status).toBe(403);
  });

  it('répond au préflight OPTIONS pour l\'origine autorisée', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app)
      .options('/api/admin/orders/1/status')
      .set('Origin', TEST_ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'PATCH');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
  });
});
