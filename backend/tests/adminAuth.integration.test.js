import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, TEST_ADMIN_PASSWORD } from './helpers/testApp.js';

describe('POST /api/admin/login', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('chemin heureux : connexion valide pose un cookie, permet d\'accéder à une route protégée', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = request.agent(built.app);

    const loginRes = await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
    expect(loginRes.status).toBe(200);

    const ordersRes = await agent.get('/api/admin/orders');
    expect(ordersRes.status).toBe(200);
  });

  it('rejette un mauvais mot de passe', async () => {
    const built = buildTestApp();
    db = built.db;

    const res = await request(built.app).post('/api/admin/login').send({ password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('verrouille après N échecs puis renvoie 429 même avec le bon mot de passe', async () => {
    const built = buildTestApp({ adminMaxLoginAttempts: 3 });
    db = built.db;

    for (let i = 0; i < 3; i++) {
      await request(built.app).post('/api/admin/login').send({ password: 'wrong' });
    }
    const res = await request(built.app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
    expect(res.status).toBe(429);
  });

  it('une route protégée sans cookie renvoie 401', async () => {
    const built = buildTestApp();
    db = built.db;

    const res = await request(built.app).get('/api/admin/orders');
    expect(res.status).toBe(401);
  });

  it('un token expiré renvoie 401 sur une route protégée', async () => {
    const built = buildTestApp({ adminTokenTtlSeconds: -1 });
    db = built.db;
    const agent = request.agent(built.app);

    await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
    const res = await agent.get('/api/admin/orders');
    expect(res.status).toBe(401);
  });

  it('logout efface le cookie : la requête suivante du même agent redevient non authentifiée', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = request.agent(built.app);

    await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
    await agent.post('/api/admin/logout');
    const res = await agent.get('/api/admin/orders');
    expect(res.status).toBe(401);
  });
});
