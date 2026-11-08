import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildTestApp, TEST_ADMIN_PASSWORD } from './helpers/testApp.js';

describe('GET /api/admin/session', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('renvoie 401 sans cookie', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/admin/session');
    expect(res.status).toBe(401);
  });

  it('renvoie 401 avec une signature invalide', async () => {
    const built = buildTestApp();
    db = built.db;
    const badToken = jwt.sign({ role: 'admin' }, 'mauvais-secret', { expiresIn: 3600 });
    const res = await request(built.app)
      .get('/api/admin/session')
      .set('Cookie', `admin_token=${badToken}`);
    expect(res.status).toBe(401);
  });

  it('renvoie 401 avec un cookie expiré', async () => {
    const built = buildTestApp();
    db = built.db;
    const expiredToken = jwt.sign({ role: 'admin' }, built.adminJwtSecret, { expiresIn: -1 });
    const res = await request(built.app)
      .get('/api/admin/session')
      .set('Cookie', `admin_token=${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('renvoie 200 { ok: true } avec un cookie valide', async () => {
    const built = buildTestApp();
    db = built.db;
    const agent = request.agent(built.app);
    await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });

    const res = await agent.get('/api/admin/session');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
