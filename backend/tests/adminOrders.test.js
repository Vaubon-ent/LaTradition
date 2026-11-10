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
    expect(res.body.orders[0].option).toBe('');
  });

  it('expose l\'option de la commande (demande directe du 2026-11-10)', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { option: 'moins_piment' });

    const agent = await loginAgent(built.app);
    const res = await agent.get('/api/admin/orders');

    expect(res.body.orders[0].option).toBe('moins_piment');
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

describe('PATCH /api/admin/orders/:id/payment (découplage Payé/Récupéré, demande directe du 2026-11-10)', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('une commande neuve est en_attente / non récupérée par défaut', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);

    const agent = await loginAgent(built.app);
    const res = await agent.get('/api/admin/orders');

    expect(res.body.orders[0].paid_status).toBe('en_attente');
    expect(res.body.orders[0].picked_up).toBe(0);
  });

  it('modifie paid_status seul, sans toucher picked_up', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.patch(`/api/admin/orders/${orderId}/payment`).send({ paid_status: 'oui' });

    expect(res.status).toBe(200);
    const order = db.prepare('SELECT paid_status, picked_up FROM orders WHERE id = ?').get(orderId);
    expect(order.paid_status).toBe('oui');
    expect(order.picked_up).toBe(0);
  });

  it('modifie picked_up seul, sans toucher paid_status (une commande peut être récupérée sans être payée)', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.patch(`/api/admin/orders/${orderId}/payment`).send({ picked_up: true });

    expect(res.status).toBe(200);
    const order = db.prepare('SELECT paid_status, picked_up FROM orders WHERE id = ?').get(orderId);
    expect(order.paid_status).toBe('en_attente'); // inchangé
    expect(order.picked_up).toBe(1);
  });

  it('rejette un paid_status invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.patch(`/api/admin/orders/${orderId}/payment`).send({ paid_status: 'peut-etre' });
    expect(res.status).toBe(400);
  });

  it('rejette un corps sans aucun champ', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.patch(`/api/admin/orders/${orderId}/payment`).send({});
    expect(res.status).toBe(400);
  });

  it('renvoie 404 pour une commande inexistante', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.patch('/api/admin/orders/9999/payment').send({ paid_status: 'oui' });
    expect(res.status).toBe(404);
  });

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).patch('/api/admin/orders/1/payment').send({ paid_status: 'oui' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/admin/orders/:id', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('modifie les PII du client et la quantité d\'une ligne, en conservant le prix unitaire figé', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    const orderId = db.prepare('SELECT id FROM orders').get().id;
    const originalUnitPrice = db.prepare('SELECT unit_price_cents FROM order_items WHERE order_id = ?').get(orderId)
      .unit_price_cents;

    const agent = await loginAgent(built.app);
    const res = await agent.put(`/api/admin/orders/${orderId}`).send({
      first_name: 'Jeanne-Marie',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 6 }],
    });

    expect(res.status).toBe(200);
    const customerId = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(orderId).customer_id;
    expect(db.prepare('SELECT first_name FROM customers WHERE id = ?').get(customerId).first_name).toBe('Jeanne-Marie');
    const item = db.prepare('SELECT quantity_500g, unit_price_cents, line_total_cents FROM order_items WHERE order_id = ?').get(orderId);
    expect(item.quantity_500g).toBe(6);
    expect(item.unit_price_cents).toBe(originalUnitPrice);
    expect(item.line_total_cents).toBe(6 * originalUnitPrice);
    expect(db.prepare('SELECT total_cents FROM orders WHERE id = ?').get(orderId).total_cents).toBe(6 * originalUnitPrice);
  });

  it('ajoute un nouveau produit à la commande (prix dérivé du tarif actuel)', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.put(`/api/admin/orders/${orderId}`).send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [
        { product_id: 'blanc', quantity_500g: 2 },
        { product_id: 'noir', quantity_500g: 1 },
      ],
    });

    expect(res.status).toBe(200);
    const items = db.prepare('SELECT product_id FROM order_items WHERE order_id = ? ORDER BY product_id').all(orderId);
    expect(items.map((i) => i.product_id)).toEqual(['blanc', 'noir']);
  });

  it('retire un produit de la commande (quantité ramenée à 0)', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, {
      items: [
        { product_id: 'blanc', quantity_500g: 2 },
        { product_id: 'noir', quantity_500g: 1 },
      ],
    });
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.put(`/api/admin/orders/${orderId}`).send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 2 }],
    });

    expect(res.status).toBe(200);
    const items = db.prepare('SELECT product_id FROM order_items WHERE order_id = ?').all(orderId);
    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBe('blanc');
  });

  it('rejette si plus aucun produit n\'a de quantité positive', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.put(`/api/admin/orders/${orderId}`).send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 0 }],
    });

    expect(res.status).toBe(400);
  });

  it('rejette un téléphone invalide sans toucher aux données existantes', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.put(`/api/admin/orders/${orderId}`).send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: 'pas un numéro',
      items: [{ product_id: 'blanc', quantity_500g: 2 }],
    });

    expect(res.status).toBe(400);
    const customerId = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(orderId).customer_id;
    expect(db.prepare('SELECT phone FROM customers WHERE id = ?').get(customerId).phone).toBe('0612345678');
  });

  it('rejette (409) si le nouveau téléphone appartient à un autre client, sans rien modifier', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { phone: '06 11 11 11 11', items: [{ product_id: 'blanc', quantity_500g: 1 }] });
    await placeOrder(built.app, { phone: '06 22 22 22 22', last_name: 'Martin', items: [{ product_id: 'noir', quantity_500g: 1 }] });
    const orderId = db
      .prepare("SELECT orders.id AS id FROM orders JOIN customers ON customers.id = orders.customer_id WHERE customers.phone = '0611111111'")
      .get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.put(`/api/admin/orders/${orderId}`).send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 22 22 22 22',
      items: [{ product_id: 'blanc', quantity_500g: 1 }],
    });

    expect(res.status).toBe(409);
    const customerId = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(orderId).customer_id;
    expect(db.prepare('SELECT phone FROM customers WHERE id = ?').get(customerId).phone).toBe('0611111111');
  });

  it('autorise de resoumettre le même téléphone que celui déjà enregistré pour ce client (no-op)', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    const orderId = db.prepare('SELECT id FROM orders').get().id;

    const agent = await loginAgent(built.app);
    const res = await agent.put(`/api/admin/orders/${orderId}`).send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 2 }],
    });

    expect(res.status).toBe(200);
  });

  it('renvoie 404 pour une commande inexistante', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/orders/9999').send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 2 }],
    });
    expect(res.status).toBe(404);
  });

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).put('/api/admin/orders/1').send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 2 }],
    });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/admin/orders/:id', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('supprime la commande et ses lignes, sans toucher au client', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app, { items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    const orderId = db.prepare('SELECT id FROM orders').get().id;
    const customerId = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(orderId).customer_id;

    const agent = await loginAgent(built.app);
    const res = await agent.delete(`/api/admin/orders/${orderId}`);

    expect(res.status).toBe(200);
    expect(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)).toBeUndefined();
    expect(db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId)).toHaveLength(0);
    // Le client reste (conservation ad vitam, .ai/decisions.md) — seule la
    // commande est supprimée, pas son historique client.
    expect(db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId)).toBeDefined();
  });

  it('renvoie 404 pour une commande inexistante', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.delete('/api/admin/orders/9999');
    expect(res.status).toBe(404);
  });

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).delete('/api/admin/orders/1');
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
