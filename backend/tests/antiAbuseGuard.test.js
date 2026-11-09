import { describe, it, expect, vi } from 'vitest';
import { generateNonce } from '../src/services/nonce.js';
import { createAntiAbuseGuard } from '../src/middleware/antiAbuseGuard.js';

const SECRET = 'test-secret';

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
  it('laisse passer une requête valide (nonce frais, honeypot vide, délai respecté) et expose nonceInfo', () => {
    let clock = 1_700_000_000_000;
    const nonce = generateNonce(SECRET, { now: clock });
    clock += 4000; // au-delà du délai minimum par défaut (3000 ms)

    const guard = createAntiAbuseGuard({ secret: SECRET, now: () => clock });
    const req = { body: { nonce } };
    const res = mockRes();
    const next = vi.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeNull();
    // La consommation effective du nonce est désormais différée jusqu'à la
    // création de la commande (db/ordersRepo.createOrder), pas ici — voir
    // orders.test.js pour la couverture de la réutilisation/du doublon.
    // Révisé le 2026-11-09 (bug P0, audit UX).
    expect(req.nonceInfo).toMatchObject({ issuedAt: 1_700_000_000_000 });
  });

  it('rejette si le champ honeypot est rempli', () => {
    let clock = 1_700_000_000_000;
    const nonce = generateNonce(SECRET, { now: clock });
    clock += 4000;

    const guard = createAntiAbuseGuard({ secret: SECRET, now: () => clock });
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

    const guard = createAntiAbuseGuard({ secret: SECRET, now: () => clock });
    const res = mockRes();
    const next = vi.fn();

    guard({ body: { nonce } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('rejette un nonce invalide', () => {
    const guard = createAntiAbuseGuard({ secret: SECRET });
    const res = mockRes();
    const next = vi.fn();

    guard({ body: { nonce: 'invalide' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });
});
