import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, TEST_ADMIN_PASSWORD } from './helpers/testApp.js';

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
  return agent;
}

describe('PUT /api/admin/products/:id', () => {
  let db;
  afterEach(() => db?.close());

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).put('/api/admin/products/blanc').send({ price_per_kg: 1200, active: true });
    expect(res.status).toBe(401);
  });

  it('modifie le prix et laisse la commande déjà passée inchangée', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonceRes = await request(built.app).get('/api/settings/public');
    await request(built.app)
      .post('/api/orders')
      .send({
        first_name: 'Jeanne',
        last_name: 'Dupont',
        phone: '06 12 34 56 78',
        items: [{ product_id: 'blanc', quantity_500g: 2 }],
        nonce: nonceRes.body.nonce,
      });

    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/products/blanc').send({ price_per_kg: 1998, active: true });

    expect(res.status).toBe(200);
    expect(db.prepare('SELECT price_per_kg FROM products WHERE id = ?').get('blanc').price_per_kg).toBe(1998);

    const item = db.prepare('SELECT unit_price_cents FROM order_items').get();
    expect(item.unit_price_cents).toBe(500);
  });

  it('rejette un prix non entier ou négatif', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const negative = await agent.put('/api/admin/products/blanc').send({ price_per_kg: -1, active: true });
    expect(negative.status).toBe(400);

    const notInt = await agent.put('/api/admin/products/blanc').send({ price_per_kg: 1.5, active: true });
    expect(notInt.status).toBe(400);
  });

  it('renvoie 404 pour un produit inconnu', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/products/inconnu').send({ price_per_kg: 1000, active: true });
    expect(res.status).toBe(404);
  });
});
