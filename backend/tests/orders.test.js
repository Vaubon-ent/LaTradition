import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { setSetting } from '../src/db/settingsRepo.js';

async function getNonce(app) {
  const res = await request(app).get('/api/settings/public');
  return res.body.nonce;
}

const validOrder = () => ({
  first_name: 'Jeanne',
  last_name: 'Dupont',
  phone: '06 12 34 56 78',
  items: [{ product_id: 'blanc', quantity_500g: 2 }],
});

describe('POST /api/orders', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('chemin heureux : crée la commande et renvoie le total serveur', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), nonce });

    expect(res.status).toBe(201);
    expect(res.body.total_cents).toBe(1000); // 2 × 500 ¢
    expect(res.body.conception_date).toBe('2026-12-13');

    const order = db.prepare('SELECT * FROM orders').get();
    expect(order.total_cents).toBe(1000);
    expect(order.status).toBe('recue');
  });

  it('rejette une commande dont toutes les quantités sont à 0', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), items: [{ product_id: 'blanc', quantity_500g: 0 }], nonce });

    expect(res.status).toBe(400);
  });

  it('rejette un téléphone invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), phone: '123', nonce });

    expect(res.status).toBe(400);
  });

  it('rejette une commande après la date limite (verrouillée) — order_deadline, pas conception_date', async () => {
    const built = buildTestApp();
    db = built.db;
    setSetting(db, 'order_deadline', '2000-01-10');
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), nonce });

    expect(res.status).toBe(403);
  });

  it('n\'est jamais verrouillée du seul fait que conception_date soit dans le passé : seule order_deadline compte', async () => {
    const built = buildTestApp();
    db = built.db;
    setSetting(db, 'conception_date', '2000-01-10'); // order_deadline (seed) reste dans le futur
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), nonce });

    expect(res.status).toBe(201);
  });

  it('rejette une requête sans nonce ou avec un nonce invalide', async () => {
    const built = buildTestApp();
    db = built.db;

    const res = await request(built.app).post('/api/orders').send({ ...validOrder(), nonce: 'invalide' });

    expect(res.status).toBe(400);
  });

  it('rejette la réutilisation du même nonce sur une 2e requête', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    await request(built.app).post('/api/orders').send({ ...validOrder(), nonce });
    const res2 = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), phone: '06 99 99 99 99', nonce });

    expect(res2.status).toBe(400);
  });

  it('rejette une 2e commande du même téléphone sur la même saison (décision C)', async () => {
    const built = buildTestApp();
    db = built.db;

    const nonce1 = await getNonce(built.app);
    await request(built.app).post('/api/orders').send({ ...validOrder(), nonce: nonce1 });

    const nonce2 = await getNonce(built.app);
    const res2 = await request(built.app).post('/api/orders').send({ ...validOrder(), nonce: nonce2 });

    expect(res2.status).toBe(409);
  });

  it('P0 (audit UX 2026-11-09) : un refus pour doublon téléphone (409) ne consomme pas le nonce — la même requête avec un téléphone corrigé réussit ensuite avec le même nonce', async () => {
    const built = buildTestApp();
    db = built.db;

    const nonce1 = await getNonce(built.app);
    await request(built.app).post('/api/orders').send({ ...validOrder(), nonce: nonce1 });

    const nonce2 = await getNonce(built.app);
    const duplicateAttempt = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), nonce: nonce2 }); // même téléphone que la 1re commande → doublon
    expect(duplicateAttempt.status).toBe(409);

    const retry = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), phone: '06 99 99 99 99', nonce: nonce2 }); // même nonce, téléphone corrigé
    expect(retry.status).toBe(201);
  });

  it('option absente : enregistrée comme chaîne vide (aucune préférence)', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), nonce });

    expect(res.status).toBe(201);
    const order = db.prepare('SELECT option FROM orders').get();
    expect(order.option).toBe('');
  });

  it('option valide (plus_piment) : enregistrée telle quelle', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), option: 'plus_piment', nonce });

    expect(res.status).toBe(201);
    const order = db.prepare('SELECT option FROM orders').get();
    expect(order.option).toBe('plus_piment');
  });

  it('rejette une option invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app)
      .post('/api/orders')
      .send({ ...validOrder(), option: 'extra_sel', nonce });

    expect(res.status).toBe(400);
  });

  it('fige le prix unitaire dans order_items : une modification ultérieure du prix ne change pas la commande déjà passée', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    await request(built.app).post('/api/orders').send({ ...validOrder(), nonce });
    db.prepare('UPDATE products SET price_per_kg = 999999 WHERE id = ?').run('blanc');

    const item = db.prepare('SELECT * FROM order_items').get();
    expect(item.unit_price_cents).toBe(500);
    expect(item.line_total_cents).toBe(1000);
  });
});
