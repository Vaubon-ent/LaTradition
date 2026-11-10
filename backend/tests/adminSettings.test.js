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

  it('modifie la date de conception et la répercute sur la route publique, sans toucher order_deadline', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({ conception_date: '2026-12-20' });
    expect(putRes.status).toBe(200);

    const publicRes = await request(built.app).get('/api/settings/public');
    expect(publicRes.body.conceptionDate).toBe('2026-12-20');
    expect(publicRes.body.orderDeadline).toBe('2026-12-06'); // inchangée (seed), plus jamais recalculée
  });

  it('rejette une date de conception invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ conception_date: 'pas-une-date' });
    expect(res.status).toBe(400);
  });

  // Les champs attendus sont en snake_case (contrairement à GET
  // /api/settings/public, qui répond en camelCase) : une clé inconnue (ex.
  // conceptionDate au lieu de conception_date) doit être rejetée
  // explicitement, pas ignorée silencieusement.
  it('rejette une clé inconnue (ex. conceptionDate en camelCase) sans rien modifier', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({ conceptionDate: '2026-12-20' });
    expect(putRes.status).toBe(400);
    expect(putRes.body.error).toMatch(/conceptionDate/);

    const publicRes = await request(built.app).get('/api/settings/public');
    expect(publicRes.body.conceptionDate).toBe('2026-12-13'); // inchangée (seed)
  });

  // order_deadline est désormais saisie manuellement, indépendamment de
  // conception_date (demande explicite du 2026-11-10, .ai/decisions.md —
  // revient sur M3, qui la calculait automatiquement).
  it('modifie order_deadline indépendamment de conception_date et la répercute sur la route publique', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({ order_deadline: '2026-12-12' });
    expect(putRes.status).toBe(200);

    const publicRes = await request(built.app).get('/api/settings/public');
    expect(publicRes.body.orderDeadline).toBe('2026-12-12');
    expect(publicRes.body.conceptionDate).toBe('2026-12-13'); // inchangée (seed)
  });

  it('rejette une order_deadline invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ order_deadline: 'pas-une-date' });
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

  it('modifie pickup_address, pickup_time et contact_phone et les répercute sur la route publique', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({
      pickup_address: '12 rue de la Tradition, 12345 Boudinville',
      pickup_time: 'à partir de 16h',
      contact_phone: '06 11 22 33 44',
    });
    expect(putRes.status).toBe(200);

    const publicRes = await request(built.app).get('/api/settings/public');
    expect(publicRes.body.pickup_address).toBe('12 rue de la Tradition, 12345 Boudinville');
    expect(publicRes.body.pickup_time).toBe('à partir de 16h');
    expect(publicRes.body.contact_phone).toBe('06 11 22 33 44');
  });

  it('rattache pickup_address/pickup_time à la nouvelle saison quand les deux sont modifiées dans la même requête', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);

    const putRes = await agent.put('/api/admin/settings').send({
      season: '2027',
      pickup_address: 'Nouvelle adresse 2027',
      pickup_time: 'à partir de 18h',
    });
    expect(putRes.status).toBe(200);

    const campaign2027 = db.prepare('SELECT * FROM campaigns WHERE season = ?').get('2027');
    expect(campaign2027.pickup_address).toBe('Nouvelle adresse 2027');
    expect(campaign2027.pickup_time).toBe('à partir de 18h');

    // La campagne 2026 (seed de test) n'est jamais modifiée par cet appel.
    const campaign2026 = db.prepare('SELECT * FROM campaigns WHERE season = ?').get('2026');
    expect(campaign2026).toBeUndefined();
  });

  it('rejette pickup_address/pickup_time si aucune season n’est encore configurée', async () => {
    const built = buildTestApp({ withSeed: false });
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ pickup_address: 'Adresse sans saison' });
    expect(res.status).toBe(400);
  });

  it('rejette pickup_address si ce n’est pas une chaîne', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ pickup_address: 42 });
    expect(res.status).toBe(400);
  });

  it('rejette pickup_time si ce n’est pas une chaîne', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = await loginAgent(built.app);
    const res = await agent.put('/api/admin/settings').send({ pickup_time: 42 });
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
