const express = require('express');
const { setSetting } = require('../../db/settingsRepo');
const { parseConceptionDate } = require('../../services/dates');

function createAdminSettingsRouter({ db }) {
  const router = express.Router();

  router.put('/', (req, res) => {
    const { conception_date, season, news, pickup_address, contact_phone } = req.body || {};

    if (
      conception_date === undefined &&
      season === undefined &&
      news === undefined &&
      pickup_address === undefined &&
      contact_phone === undefined
    ) {
      return res.status(400).json({ error: 'Aucun paramètre à modifier.' });
    }

    if (conception_date !== undefined) {
      try {
        parseConceptionDate(conception_date);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      setSetting(db, 'conception_date', conception_date);
    }

    if (season !== undefined) {
      if (typeof season !== 'string' || season.trim().length === 0) {
        return res.status(400).json({ error: 'season doit être une chaîne non vide.' });
      }
      setSetting(db, 'season', season);
    }

    if (news !== undefined) {
      if (typeof news !== 'string') {
        return res.status(400).json({ error: 'news doit être une chaîne (vide autorisée).' });
      }
      setSetting(db, 'news', news);
    }

    if (pickup_address !== undefined) {
      if (typeof pickup_address !== 'string') {
        return res.status(400).json({ error: 'pickup_address doit être une chaîne (vide autorisée).' });
      }
      setSetting(db, 'pickup_address', pickup_address);
    }

    if (contact_phone !== undefined) {
      if (typeof contact_phone !== 'string') {
        return res.status(400).json({ error: 'contact_phone doit être une chaîne (vide autorisée).' });
      }
      setSetting(db, 'contact_phone', contact_phone);
    }

    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminSettingsRouter };
