import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

async function getNonce(app) {
  const res = await request(app).get('/api/settings/public');
  return res.body.nonce;
}

const PHONE = '06 12 34 56 78';

describe('POST /api/check-phone', () => {
  let db;
  afterEach(() => db?.close());

  it('renvoie duplicate: false pour un téléphone inconnu', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app).post('/api/check-phone').send({ phone: PHONE, nonce });

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(false);
  });

  it('renvoie duplicate: false pour un client connu mais sans commande cette saison', async () => {
    const built = buildTestApp();
    db = built.db;
    const orderNonce = await getNonce(built.app);
    await request(built.app)
      .post('/api/orders')
      .send({
        first_name: 'Jeanne',
        last_name: 'Dupont',
        phone: PHONE,
        items: [{ product_id: 'blanc', quantity_500g: 2 }],
        nonce: orderNonce,
      });
    db.prepare("UPDATE orders SET season = '2025'").run();

    const checkNonce = await getNonce(built.app);
    const res = await request(built.app).post('/api/check-phone').send({ phone: PHONE, nonce: checkNonce });

    expect(res.body.duplicate).toBe(false);
  });

  it('renvoie duplicate: true pour un client ayant déjà commandé cette saison', async () => {
    const built = buildTestApp();
    db = built.db;
    const orderNonce = await getNonce(built.app);
    await request(built.app)
      .post('/api/orders')
      .send({
        first_name: 'Jeanne',
        last_name: 'Dupont',
        phone: PHONE,
        items: [{ product_id: 'blanc', quantity_500g: 2 }],
        nonce: orderNonce,
      });

    const checkNonce = await getNonce(built.app);
    const res = await request(built.app).post('/api/check-phone').send({ phone: PHONE, nonce: checkNonce });

    expect(res.body.duplicate).toBe(true);
  });

  it('reconnaît le même téléphone sous un format différent (national vs +33)', async () => {
    const built = buildTestApp();
    db = built.db;
    const orderNonce = await getNonce(built.app);
    await request(built.app)
      .post('/api/orders')
      .send({
        first_name: 'Jeanne',
        last_name: 'Dupont',
        phone: '0612345678',
        items: [{ product_id: 'blanc', quantity_500g: 2 }],
        nonce: orderNonce,
      });

    const checkNonce = await getNonce(built.app);
    const res = await request(built.app)
      .post('/api/check-phone')
      .send({ phone: '+33 6 12 34 56 78', nonce: checkNonce });

    expect(res.body.duplicate).toBe(true);
  });

  it('rejette un téléphone invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const res = await request(built.app).post('/api/check-phone').send({ phone: '123', nonce });

    expect(res.status).toBe(400);
  });

  it('rejette une requête sans nonce ou avec un nonce invalide', async () => {
    const built = buildTestApp();
    db = built.db;

    const res = await request(built.app).post('/api/check-phone').send({ phone: PHONE, nonce: 'invalide' });

    expect(res.status).toBe(403);
  });

  it('ne consomme pas le nonce : il reste utilisable ensuite pour POST /api/orders', async () => {
    const built = buildTestApp();
    db = built.db;
    const nonce = await getNonce(built.app);

    const checkRes = await request(built.app).post('/api/check-phone').send({ phone: PHONE, nonce });
    expect(checkRes.status).toBe(200);

    const orderRes = await request(built.app)
      .post('/api/orders')
      .send({
        first_name: 'Jeanne',
        last_name: 'Dupont',
        phone: PHONE,
        items: [{ product_id: 'blanc', quantity_500g: 2 }],
        nonce,
      });

    expect(orderRes.status).toBe(201);
  });
});
