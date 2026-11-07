import { describe, it, expect } from 'vitest';
import { generateNonce, verifyNonce, NonceError } from '../src/services/nonce.js';

const SECRET = 'test-secret';

describe('generateNonce / verifyNonce', () => {
  it('accepte un nonce valide et retourne son horodatage d’émission', () => {
    const now = 1_700_000_000_000;
    const token = generateNonce(SECRET, { now });
    const info = verifyNonce(token, SECRET, { now: now + 5000 });
    expect(info.issuedAt).toBe(now);
  });

  it('rejette un nonce dont la signature a été altérée', () => {
    const token = generateNonce(SECRET);
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(() => verifyNonce(tampered, SECRET)).toThrow(NonceError);
  });

  it('rejette un nonce signé avec un autre secret', () => {
    const token = generateNonce('autre-secret');
    expect(() => verifyNonce(token, SECRET)).toThrow(NonceError);
  });

  it('rejette un nonce expiré', () => {
    const now = 1_700_000_000_000;
    const token = generateNonce(SECRET, { ttlSeconds: 60, now });
    expect(() => verifyNonce(token, SECRET, { now: now + 61_000 })).toThrow(NonceError);
  });

  it('accepte un nonce à la dernière milliseconde de son TTL', () => {
    const now = 1_700_000_000_000;
    const token = generateNonce(SECRET, { ttlSeconds: 60, now });
    expect(() => verifyNonce(token, SECRET, { now: now + 60_000 })).not.toThrow();
  });

  it('rejette un nonce malformé', () => {
    expect(() => verifyNonce('pas-un-nonce-valide', SECRET)).toThrow(NonceError);
  });

  it('rejette un nonce manquant', () => {
    expect(() => verifyNonce(undefined, SECRET)).toThrow(NonceError);
  });
});
