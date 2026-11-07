// Ligne unique (id = 1) : un seul compte admin partagé, donc un seul
// compteur global, pas de verrou par IP (voir schema.js et .ai/decisions.md).

function getState(db) {
  const row = db.prepare('SELECT failed_count, locked_until FROM admin_login_attempts WHERE id = 1').get();
  return row || { failed_count: 0, locked_until: null };
}

function isLocked(db, now = Date.now()) {
  const { locked_until } = getState(db);
  return typeof locked_until === 'number' && now < locked_until;
}

function recordFailure(db, { maxAttempts, lockDurationMs, now = Date.now() }) {
  const state = getState(db);
  const failedCount = state.failed_count + 1;
  const lockedUntil = failedCount >= maxAttempts ? now + lockDurationMs : null;

  db.prepare(
    `INSERT INTO admin_login_attempts (id, failed_count, locked_until) VALUES (1, @failedCount, @lockedUntil)
     ON CONFLICT(id) DO UPDATE SET failed_count = @failedCount, locked_until = @lockedUntil`
  ).run({ failedCount, lockedUntil });

  return { failedCount, lockedUntil };
}

function reset(db) {
  db.prepare(
    `INSERT INTO admin_login_attempts (id, failed_count, locked_until) VALUES (1, 0, NULL)
     ON CONFLICT(id) DO UPDATE SET failed_count = 0, locked_until = NULL`
  ).run();
}

module.exports = { getState, isLocked, recordFailure, reset };
