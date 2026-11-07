import { describe, it, expect, afterEach } from 'vitest';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import * as loginAttempts from '../src/db/adminLoginAttemptsRepo.js';

describe('adminLoginAttemptsRepo', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('état initial : aucun échec, non verrouillé', () => {
    db = getDb(':memory:');
    migrate(db);
    expect(loginAttempts.getState(db)).toEqual({ failed_count: 0, locked_until: null });
    expect(loginAttempts.isLocked(db)).toBe(false);
  });

  it("verrouille après maxAttempts échecs, pas avant", () => {
    db = getDb(':memory:');
    migrate(db);
    const now = 1000;
    for (let i = 0; i < 4; i++) {
      loginAttempts.recordFailure(db, { maxAttempts: 5, lockDurationMs: 60000, now });
      expect(loginAttempts.isLocked(db, now)).toBe(false);
    }
    loginAttempts.recordFailure(db, { maxAttempts: 5, lockDurationMs: 60000, now });
    expect(loginAttempts.isLocked(db, now)).toBe(true);
  });

  it('le verrou expire après lockDurationMs', () => {
    db = getDb(':memory:');
    migrate(db);
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      loginAttempts.recordFailure(db, { maxAttempts: 5, lockDurationMs: 60000, now });
    }
    expect(loginAttempts.isLocked(db, now + 60000)).toBe(false);
    expect(loginAttempts.isLocked(db, now + 59999)).toBe(true);
  });

  it('reset remet le compteur et le verrou à zéro', () => {
    db = getDb(':memory:');
    migrate(db);
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      loginAttempts.recordFailure(db, { maxAttempts: 5, lockDurationMs: 60000, now });
    }
    loginAttempts.reset(db);
    expect(loginAttempts.getState(db)).toEqual({ failed_count: 0, locked_until: null });
    expect(loginAttempts.isLocked(db, now)).toBe(false);
  });
});
