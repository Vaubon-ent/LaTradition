import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';

let db;

beforeEach(() => {
  db = getDb(':memory:');
  migrate(db);
});

afterEach(() => {
  db.close();
});

describe('GET /api/health', () => {
  it('répond 200 avec status ok', async () => {
    const app = createApp({ db, nonceSecret: 'test-secret' });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
