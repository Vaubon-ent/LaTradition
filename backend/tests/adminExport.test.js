import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { buildTestApp, TEST_ADMIN_PASSWORD } from './helpers/testApp.js';

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD });
  return agent;
}

async function placeOrder(app) {
  const nonceRes = await request(app).get('/api/settings/public');
  return request(app)
    .post('/api/orders')
    .send({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '06 12 34 56 78',
      items: [{ product_id: 'blanc', quantity_500g: 2 }],
      nonce: nonceRes.body.nonce,
    });
}

describe('GET /api/admin/export.csv', () => {
  let db;
  afterEach(() => db?.close());

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/admin/export.csv');
    expect(res.status).toBe(401);
  });

  it('renvoie un CSV avec toutes les commandes de la saison', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);

    const agent = await loginAgent(built.app);
    const res = await agent.get('/api/admin/export.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain('Dupont');
  });
});

describe('GET /api/admin/export.xlsx', () => {
  let db;
  afterEach(() => db?.close());

  it('refuse sans authentification', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/admin/export.xlsx');
    expect(res.status).toBe(401);
  });

  it('renvoie un classeur xlsx valide contenant la commande', async () => {
    const built = buildTestApp();
    db = built.db;
    await placeOrder(built.app);

    const agent = await loginAgent(built.app);
    // Le type MIME xlsx n'est pas reconnu par superagent : on force le
    // buffering binaire pour récupérer le contenu brut dans res.body.
    const res = await agent.get('/api/admin/export.xlsx').buffer().parse((parseRes, callback) => {
      const chunks = [];
      parseRes.on('data', (chunk) => chunks.push(chunk));
      parseRes.on('end', () => callback(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const sheet = workbook.getWorksheet('Commandes');
    expect(sheet.getRow(2).values).toContain('Dupont');
  });
});
