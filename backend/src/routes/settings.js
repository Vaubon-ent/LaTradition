const express = require('express');
const { getLockInfo } = require('../services/dates');
const { generateNonce } = require('../services/nonce');
const { getSetting } = require('../db/settingsRepo');

function createSettingsRouter({ db, nonceSecret }) {
  const router = express.Router();

  router.get('/public', (req, res) => {
    const conceptionDate = getSetting(db, 'conception_date');
    if (!conceptionDate) {
      return res.status(500).json({ error: 'Configuration manquante : conception_date.' });
    }

    const lockInfo = getLockInfo(conceptionDate);
    const nonce = generateNonce(nonceSecret);
    const news = getSetting(db, 'news') || '';
    const pickup_address = getSetting(db, 'pickup_address') || '';
    const contact_phone = getSetting(db, 'contact_phone') || '';

    res.json({ ...lockInfo, nonce, news, pickup_address, contact_phone });
  });

  return router;
}

module.exports = { createSettingsRouter };
