const express = require('express');
const { verifyPassword, generateToken } = require('../../services/adminAuth');
const loginAttempts = require('../../db/adminLoginAttemptsRepo');

const COOKIE_NAME = 'admin_token';

function createAdminAuthRouter({ db, adminPasswordHash, adminJwtSecret, adminTokenTtlSeconds, adminMaxLoginAttempts, adminLockDurationMs }) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    if (loginAttempts.isLocked(db)) {
      console.warn('[admin-login] tentative refusée : compte verrouillé');
      return res.status(429).json({ error: 'Trop de tentatives échouées. Réessayez plus tard.' });
    }

    const { password } = req.body || {};
    if (!verifyPassword(password, adminPasswordHash)) {
      // Jamais le mot de passe reçu dans le log, uniquement l'événement.
      loginAttempts.recordFailure(db, {
        maxAttempts: adminMaxLoginAttempts,
        lockDurationMs: adminLockDurationMs,
      });
      console.warn('[admin-login] échec de connexion');
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }

    loginAttempts.reset(db);
    const token = generateToken(adminJwtSecret, adminTokenTtlSeconds);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: adminTokenTtlSeconds * 1000,
    });
    res.json({ ok: true });
  });

  // Pas de middleware d'auth ici : effacer un cookie absent ou déjà expiré
  // doit rester possible sans se heurter à un 401.
  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminAuthRouter, COOKIE_NAME };
