const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes

class NonceError extends Error {}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

// Émis par le serveur avant toute saisie client (GET /api/settings/public) :
// ne peut donc pas incorporer de PII, seulement un identifiant aléatoire et
// des horodatages, signés avec le secret serveur.
function generateNonce(secret, { ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() } = {}) {
  if (!secret) {
    throw new Error('NONCE_SECRET manquant.');
  }
  const id = crypto.randomBytes(16).toString('base64url');
  const issuedAt = now;
  const expiresAt = issuedAt + ttlSeconds * 1000;
  const payload = `${id}.${issuedAt}.${expiresAt}`;
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

function verifyNonce(token, secret, { now = Date.now() } = {}) {
  if (!secret) {
    throw new Error('NONCE_SECRET manquant.');
  }
  if (typeof token !== 'string' || token.length === 0) {
    throw new NonceError('Nonce manquant.');
  }

  const parts = token.split('.');
  if (parts.length !== 4) {
    throw new NonceError('Nonce malformé.');
  }
  const [id, issuedAtStr, expiresAtStr, signature] = parts;
  const payload = `${id}.${issuedAtStr}.${expiresAtStr}`;
  const expectedSignature = sign(payload, secret);

  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
    throw new NonceError('Signature de nonce invalide.');
  }

  const issuedAt = Number(issuedAtStr);
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new NonceError('Nonce malformé.');
  }
  if (now > expiresAt) {
    throw new NonceError('Nonce expiré.');
  }

  return { id, issuedAt, expiresAt };
}

module.exports = { generateNonce, verifyNonce, NonceError, DEFAULT_TTL_SECONDS };
