import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { generateNonce } from '../src/services/nonce.js';
import { createAntiAbuseGuard } from '../src/middleware/antiAbuseGuard.js';

const SECRET = 'test-secret';
let db;

beforeEach(() => {
  db = getDb(':memory:');
  migrate(db);
});

afterEach(() => {
  db.close();
});

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

describe('createAntiAbuseGuard', () => {
  it('laisse passer une requête valide (nonce frais, honeypot vide, délai respecté)', () => {
    let clock = 1_700_000_000_000;
    const nonce = generateNonce(SECRET, { now: clock });
    clock += 4000; // au-delà du délai minimum par défaut (3000 ms)

    const guard = createAntiAbuseGuard({ db, secret: SECRET, now: () => clock });
    const req = { body: { nonce } };
    const res = mockRes();
    const next = vi.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeNull();
  });

  it('rejette une 2e requête réutilisant le même nonce', () => {
    let clock = 1_700_000_000_000;
    const nonce = generateNonce(SECRET, { now: clock });
    clock += 4000;

    const guard = createAntiAbuseGuard({ db, secret: SECRET, now: () => clock });
    guard({ body: { nonce } }, mockRes(), vi.fn());

    const res2 = mockRes();
    const next2 = vi.fn();
    guard({ body: { nonce } }, res2, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(400);
  });

  it('rejette si le champ honeypot est rempli', () => {
    let clock = 1_700_000_000_000;
    const nonce = generateNonce(SECRET, { now: clock });
    clock += 4000;

    const guard = createAntiAbuseGuard({ db, secret: SECRET, now: () => clock });
    const res = mockRes();
    const next = vi.fn();

    guard({ body: { nonce, website: 'http://spam.example' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('rejette une soumission trop rapide après l’émission du nonce', () => {
    let clock = 1_700_000_000_000;
    const nonce = generateNonce(SECRET, { now: clock });
    clock += 100; // bien en dessous du délai minimum

    const guard = createAntiAbuseGuard({ db, secret: SECRET, now: () => clock });
    const res = mockRes();
    const next = vi.fn();

    guard({ body: { nonce } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('rejette un nonce invalide sans jamais le consommer en double-compte', () => {
    const guard = createAntiAbuseGuard({ db, secret: SECRET });
    const res = mockRes();
    const next = vi.fn();

    guard({ body: { nonce: 'invalide' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });
});
