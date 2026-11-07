import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, TEST_ADMIN_PASSWORD } from './helpers/testApp.js';

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
  return agent;
}

describe('PUT /api/admin/settings', () => {
  let db;
  afterEach(() => db?.close());

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).put('/api/admin/settings').send({ conception_date: '2026-12-20' });
    expect(res.status).toBe(401);
  });

  it('modifie la date de conception et recalcule bien la date limite publique', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({ conception_date: '2026-12-20' });
    expect(putRes.status).toBe(200);

    const publicRes = await request(built.app).get('/api/settings/public');
    expect(publicRes.body.orderDeadline).toBe('2026-12-13');
  });

  it('rejette une date de conception invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ conception_date: 'pas-une-date' });
    expect(res.status).toBe(400);
  });

  it('rejette une saison vide', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ season: '  ' });
    expect(res.status).toBe(400);
  });

  it('rejette un corps sans aucun paramètre', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({});
    expect(res.status).toBe(400);
  });

  it('modifie le texte de news et le répercute sur la route publique', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({ news: 'Fermeture des commandes le 6 décembre.' });
    expect(putRes.status).toBe(200);

    const publicRes = await request(built.app).get('/api/settings/public');
    expect(publicRes.body.news).toBe('Fermeture des commandes le 6 décembre.');
  });

  it('accepte une chaîne vide pour news (effacer l’actualité)', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ news: '' });
    expect(res.status).toBe(200);
  });

  it('rejette news si ce n’est pas une chaîne', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ news: 42 });
    expect(res.status).toBe(400);
  });

  it('modifie pickup_address et contact_phone et les répercute sur la route publique', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({
      pickup_address: '12 rue de la Tradition, 12345 Boudinville',
      contact_phone: '06 11 22 33 44',
    });
    expect(putRes.status).toBe(200);

    const publicRes = await request(built.app).get('/api/settings/public');
    expect(publicRes.body.pickup_address).toBe('12 rue de la Tradition, 12345 Boudinville');
    expect(publicRes.body.contact_phone).toBe('06 11 22 33 44');
  });

  it('rejette pickup_address si ce n’est pas une chaîne', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ pickup_address: 42 });
    expect(res.status).toBe(400);
  });

  it('rejette contact_phone si ce n’est pas une chaîne', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ contact_phone: 42 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/customers/:id/anonymize', () => {
  let db;
  afterEach(() => db?.close());

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).post('/api/admin/customers/1/anonymize');
    expect(res.status).toBe(401);
  });

  it("remplace nom/prénom/téléphone sans toucher aux commandes passées", async () => {
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
    const customerId = db.prepare('SELECT id FROM customers').get().id;
    const orderTotalBefore = db.prepare('SELECT total_cents FROM orders').get().total_cents;

    const agent = await loginAgent(built.app);
    const res = await agent.post(`/api/admin/customers/${customerId}/anonymize`);
    expect(res.status).toBe(200);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    expect(customer.first_name).toBe('Anonymisé');
    expect(customer.last_name).toBe('Anonymisé');
    expect(customer.phone).not.toBe('0612345678');

    const orderAfter = db.prepare('SELECT total_cents FROM orders WHERE customer_id = ?').get(customerId);
    expect(orderAfter.total_cents).toBe(orderTotalBefore);
  });

  it('renvoie 404 pour un client inexistant', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.post('/api/admin/customers/9999/anonymize');
    expect(res.status).toBe(404);
  });
});
