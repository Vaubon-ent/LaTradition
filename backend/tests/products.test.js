import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('GET /api/products', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('renvoie les produits actifs seedés', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([
      { id: 'blanc', name: 'Boudin blanc', price_per_kg: 1000 },
      { id: 'blanc_morue', name: 'Boudin blanc morue', price_per_kg: 1000 },
      { id: 'noir', name: 'Boudin noir', price_per_kg: 1000 },
    ]);
  });

  it('exclut les produits désactivés', async () => {
    const built = buildTestApp();
    db = built.db;
    db.prepare("INSERT INTO products (id, name, price_per_kg, active) VALUES ('secret', 'Hors vente', 1, 0)").run();

    const res = await request(built.app).get('/api/products');

    expect(res.body.products.map((p) => p.id)).not.toContain('secret');
  });
});
