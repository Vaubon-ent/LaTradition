const express = require('express');
const { getLockInfo } = require('../services/dates');
const { generateNonce } = require('../services/nonce');
const { getSetting } = require('../db/settingsRepo');
const { getCampaign } = require('../db/campaignsRepo');

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
    const contact_phone = getSetting(db, 'contact_phone') || '';

    // pickup_address/pickup_time vivent dans `campaigns`, indexées par la
    // saison courante (.ai/decisions.md) — pas dans le singleton `settings`.
    const season = getSetting(db, 'season');
    const campaign = season ? getCampaign(db, season) : undefined;
    const pickup_address = campaign?.pickup_address || '';
    const pickup_time = campaign?.pickup_time || '';

    res.json({ ...lockInfo, nonce, news, pickup_address, pickup_time, contact_phone });
  });

  return router;
}

module.exports = { createSettingsRouter };
