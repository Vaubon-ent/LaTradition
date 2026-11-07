const express = require('express');
const { verifyNonce, NonceError } = require('../services/nonce');
const { normalizePhone, ValidationError } = require('../services/validation');
const { getSetting } = require('../db/settingsRepo');
const { findCustomerByPhone } = require('../db/customersRepo');
const { hasOrderForSeason } = require('../db/ordersRepo');

// Vérification "légère" de doublon téléphone, appelée en live par le front
// après la saisie des PII (.ai/decisions.md, 2026-11-07). Le nonce est
// vérifié (signature + TTL) mais jamais consommé ici : il reste réservé à la
// vraie soumission de commande (POST /api/orders), qui seule le marque comme
// utilisé. Comportement attendu côté front : avertissement non bloquant, le
// rejet définitif restant géré par la contrainte serveur à la création.
function createCheckPhoneRouter({ db, nonceSecret }) {
  const router = express.Router();

  router.post('/', (req, res) => {
    try {
      verifyNonce(req.body?.nonce, nonceSecret);
    } catch (err) {
      if (err instanceof NonceError) {
        return res.status(403).json({ error: err.message });
      }
      throw err;
    }

    let phone;
    try {
      phone = normalizePhone(req.body?.phone);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const season = getSetting(db, 'season');
    if (!season) {
      return res.status(500).json({ error: 'Configuration manquante : season.' });
    }

    const customer = findCustomerByPhone(db, phone);
    const duplicate = customer ? hasOrderForSeason(db, customer.id, season) : false;

    res.json({ duplicate });
  });

  return router;
}

module.exports = { createCheckPhoneRouter };
