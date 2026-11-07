const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AdminAuthError extends Error {}

function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || password.length === 0) {
    return false;
  }
  return bcrypt.compareSync(password, passwordHash);
}

function generateToken(secret, ttlSeconds) {
  return jwt.sign({ role: 'admin' }, secret, { expiresIn: ttlSeconds });
}

// Lève AdminAuthError (jamais l'erreur brute de jsonwebtoken) pour que les
// appelants n'aient qu'un seul type d'erreur à distinguer, comme pour
// services/nonce.js.
function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new AdminAuthError('Jeton de session manquant.');
  }
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    throw new AdminAuthError('Jeton de session invalide ou expiré.');
  }
}

module.exports = { AdminAuthError, verifyPassword, generateToken, verifyToken };
