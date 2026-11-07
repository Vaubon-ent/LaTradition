import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { consumeNonce, purgeExpiredNonces } from '../src/db/nonceStore.js';

let db;

beforeEach(() => {
  db = getDb(':memory:');
  migrate(db);
});

afterEach(() => {
  db.close();
});

describe('consumeNonce', () => {
  it('accepte un nonce présenté une seule fois', () => {
    expect(() => consumeNonce(db, { id: 'n1', expiresAt: Date.now() + 10_000 })).not.toThrow();
  });

  it('rejette la 2e présentation du même nonce', () => {
    consumeNonce(db, { id: 'n1', expiresAt: Date.now() + 10_000 });
    expect(() => consumeNonce(db, { id: 'n1', expiresAt: Date.now() + 10_000 })).toThrow(/déjà utilisé/);
  });
});

describe('purgeExpiredNonces', () => {
  it('supprime les nonces expirés mais conserve les nonces encore valides', () => {
    const now = Date.now();
    consumeNonce(db, { id: 'expire', expiresAt: now - 1000 }, now - 2000);
    consumeNonce(db, { id: 'valide', expiresAt: now + 10_000 }, now);

    purgeExpiredNonces(db, now);

    const rows = db.prepare('SELECT id FROM used_nonces').all().map((r) => r.id);
    expect(rows).toEqual(['valide']);
  });
});
