const { verifyNonce, NonceError } = require('../services/nonce');

const DEFAULT_MIN_DELAY_MS = 3000;
const DEFAULT_HONEYPOT_FIELD = 'website';

// Combine deux des trois mécanismes retenus en .ai/decisions.md pour protéger
// POST /api/orders sans identité client :
//  1. nonce signé à usage unique : seule la signature et le TTL sont vérifiés
//     ici (lecture pure, sans accès DB). La consommation effective (marquage
//     « utilisé ») est différée jusqu'à la création de la commande
//     (db/ordersRepo.createOrder), dans la même transaction que l'insertion —
//     révisé le 2026-11-09 (bug P0, audit UX) : consommer le nonce ici, avant
//     de savoir si la commande sera réellement créée, empêchait de corriger
//     et revalider (ex. après un refus pour doublon téléphone) sans recharger
//     la page pour obtenir un nonce frais.
//  2. délai minimum depuis l'émission du nonce (anti-bot, basé sur un
//     horodatage signé, donc non falsifiable par le client) ;
//  3. honeypot (champ caché rempli uniquement par un bot).
// Le dédoublonnage par téléphone (mécanisme 2 de la décision) est appliqué
// séparément au niveau de la création de commande (contrainte DB M2), pas ici.
function createAntiAbuseGuard({
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

    req.nonceInfo = nonceInfo;
    next();
  };
}

module.exports = { createAntiAbuseGuard, DEFAULT_MIN_DELAY_MS, DEFAULT_HONEYPOT_FIELD };
