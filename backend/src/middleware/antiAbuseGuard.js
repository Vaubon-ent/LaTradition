const { verifyNonce, NonceError } = require('../services/nonce');
const { consumeNonce } = require('../db/nonceStore');

const DEFAULT_MIN_DELAY_MS = 3000;
const DEFAULT_HONEYPOT_FIELD = 'website';

// Combine les trois mécanismes retenus en .ai/decisions.md pour protéger
// POST /api/orders sans identité client :
//  1. nonce signé à usage unique (anti-replay) ;
//  2. délai minimum depuis l'émission du nonce (anti-bot, basé sur un
//     horodatage signé, donc non falsifiable par le client) ;
//  3. honeypot (champ caché rempli uniquement par un bot).
// Le dédoublonnage par téléphone (mécanisme 2 de la décision) est appliqué
// séparément au niveau de la création de commande (contrainte DB M2), pas ici.
function createAntiAbuseGuard({
  db,
  secret,
  minDelayMs = DEFAULT_MIN_DELAY_MS,
  honeypotField = DEFAULT_HONEYPOT_FIELD,
  now = () => Date.now(),
}) {
  return function antiAbuseGuard(req, res, next) {
    const body = req.body || {};

    let nonceInfo;
    try {
      nonceInfo = verifyNonce(body.nonce, secret, { now: now() });
      consumeNonce(db, nonceInfo, now());
    } catch (err) {
      if (err instanceof NonceError) {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }

    if (body[honeypotField]) {
      return res.status(400).json({ error: 'Requête rejetée.' });
    }

    const elapsedMs = now() - nonceInfo.issuedAt;
    if (elapsedMs < minDelayMs) {
      return res.status(400).json({ error: 'Requête rejetée.' });
    }

    next();
  };
}

module.exports = { createAntiAbuseGuard, DEFAULT_MIN_DELAY_MS, DEFAULT_HONEYPOT_FIELD };
