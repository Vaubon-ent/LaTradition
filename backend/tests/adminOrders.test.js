import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, TEST_ADMIN_PASSWORD } from './helpers/testApp.js';

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
  return agent;
}

async function getNonce(app) {
  const res = await request(app).get('/api/settings/public');
  return res.body.nonce;
}

async function placeOrder(app, overrides = {}) {
  const nonce = await getNonce(app);
  return request(app)
    .post('/api/orders')
    .send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 2 }],
      nonce,
      ...overrides,
    });
}

describe('GET /api/admin/orders', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('refuse l\'accès sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/admin/orders');
    expect(res.status).toBe(401);
  });

  it('liste les commandes avec le client et les lignes de produits', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);

    const agent = await loginAgent(built.app);
    const res = await agent.get('/api/admin/orders');

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].phone).toBe('0612345678');
    expect(res.body.orders[0].items).toHaveLength(1);
    expect(res.body.orders[0].items[0].product_id).toBe('blanc');
  });

  it('filtre par statut', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);

    const agent = await loginAgent(built.app);
    const matching = await agent.get('/api/admin/orders?status=recue');
    expect(matching.body.orders).toHaveLength(1);

    const notMatching = await agent.get('/api/admin/orders?status=retiree');
    expect(notMatching.body.orders).toHaveLength(0);
  });

  it('rejette un statut de filtre invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.get('/api/admin/orders?status=inconnu');
    expect(res.status).toBe(400);
  });

  it('recherche par nom ou téléphone', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);

    const agent = await loginAgent(built.app);
    const byName = await agent.get('/api/admin/orders?search=Dupont');
    expect(byName.body.orders).toHaveLength(1);

    const byPhone = await agent.get('/api/admin/orders?search=0612345678');
    expect(byPhone.body.orders).toHaveLength(1);

    const noMatch = await agent.get('/api/admin/orders?search=Martin');
    expect(noMatch.body.orders).toHaveLength(0);
  });
});

describe('PATCH /api/admin/orders/:id/status', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('change le statut d\'une commande existante', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.patch(`/api/admin/orders/${orderId}/status`).send({ status: 'payee' });

    expect(res.status).toBe(200);
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('payee');
  });

  it('rejette un statut invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.patch(`/api/admin/orders/${orderId}/status`).send({ status: 'inconnu' });
    expect(res.status).toBe(400);
  });

  it('renvoie 404 pour une commande inexistante', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.patch('/api/admin/orders/9999/status').send({ status: 'payee' });
    expect(res.status).toBe(404);
  });

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).patch('/api/admin/orders/1/status').send({ status: 'payee' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/production', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('calcule les totaux exacts en kg par produit', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { phone: '06 11 11 11 11', items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    await placeOrder(built.app, { phone: '06 22 22 22 22', items: [{ product_id: 'blanc', quantity_500g: 1 }] });

    const agent = await loginAgent(built.app);
    const res = await agent.get('/api/admin/production');

    expect(res.status).toBe(200);
    const blanc = res.body.totals.find((t) => t.product_id === 'blanc');
    expect(blanc.total_500g).toBe(3);
    expect(blanc.total_kg).toBe(1.5);
  });

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/admin/production');
    expect(res.status).toBe(401);
  });
});
