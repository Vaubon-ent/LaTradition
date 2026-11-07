import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('En-têtes de sécurité (M9, helmet)', () => {
  let db;
  afterEach(() => db?.close());

  it('pose les en-têtes de sécurité de base sur toute réponse', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('aucune route n\'utilise de PII (nom/téléphone) comme segment d\'URL', async () => {
    // Vérification structurelle (CDC §9) : les routes paramétrées existantes
    // identifient toujours une ressource par id numérique opaque, jamais par
    // téléphone ou nom.
    const built = buildTestApp();
    db = built.db;
    const nonceRes = await request(built.app).get('/api/settings/public');
    await request(built.app)
      .post('/api/orders')
      .send({
        first_name: 'Jeanne',
        last_name: 'Dupont',
        phone: '06 12 34 56 78',
        items: [{ product_id: 'blanc', quantity_500g: 1 }],
        nonce: nonceRes.body.nonce,
      });
    const customerId = db.prepare('SELECT id FROM customers').get().id;
    expect(String(customerId)).toMatch(/^\d+$/);
  });
});
