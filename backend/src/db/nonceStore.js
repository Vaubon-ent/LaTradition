const { NonceError } = require('../services/nonce');

function purgeExpiredNonces(db, now = Date.now()) {
  db.prepare('DELETE FROM used_nonces WHERE expires_at < ?').run(now);
}

// Marque le nonce comme consommé. L'INSERT échoue (contrainte PK) si le
// nonce a déjà été présenté — c'est la détection d'usage unique elle-même.
function consumeNonce(db, { id, expiresAt }, now = Date.now()) {
  purgeExpiredNonces(db, now);
  try {
    db.prepare('INSERT INTO used_nonces (id, expires_at) VALUES (?, ?)').run(id, expiresAt);
  } catch (err) {
    throw new NonceError('Nonce déjà utilisé.');
  }
}

module.exports = { purgeExpiredNonces, consumeNonce };
