const express = require('express');
const { setSetting, getSetting } = require('../../db/settingsRepo');
const { upsertCampaign } = require('../../db/campaignsRepo');
const { parseDateString } = require('../../services/dates');

function createAdminSettingsRouter({ db }) {
  const router = express.Router();

  const KNOWN_FIELDS = [
    'conception_date',
    'order_deadline',
    'season',
    'news',
    'pickup_address',
    'pickup_time',
    'contact_phone',
  ];

  router.put('/', (req, res) => {
    const body = req.body || {};
    const { conception_date, order_deadline, season, news, pickup_address, pickup_time, contact_phone } = body;

    // Les champs attendus sont en snake_case (contrairement à GET
    // /api/settings/public, qui répond en camelCase) : une clé inconnue est
    // rejetée explicitement plutôt qu'ignorée silencieusement, pour éviter
    // qu'une erreur de casse (ex. conceptionDate au lieu de conception_date,
    // déjà vécu deux fois avec order_deadline puis conception_date) donne
    // l'impression d'un succès alors que rien n'a été modifié.
    const unknownFields = Object.keys(body).filter((key) => !KNOWN_FIELDS.includes(key));
    if (unknownFields.length > 0) {
      return res.status(400).json({ error: `Paramètre(s) inconnu(s) : ${unknownFields.join(', ')}.` });
    }

    if (
      conception_date === undefined &&
      order_deadline === undefined &&
      season === undefined &&
      news === undefined &&
      pickup_address === undefined &&
      pickup_time === undefined &&
      contact_phone === undefined
    ) {
      return res.status(400).json({ error: 'Aucun paramètre à modifier.' });
    }

    if (conception_date !== undefined) {
      try {
        parseDateString(conception_date, 'Date de conception');
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      setSetting(db, 'conception_date', conception_date);
    }

    // order_deadline n'est plus calculée (conception_date - 7 jours, M3) :
    // saisie manuelle indépendante par l'admin (demande explicite du
    // 2026-11-10, .ai/decisions.md — revient sur M3).
    if (order_deadline !== undefined) {
      try {
        parseDateString(order_deadline, 'Date limite');
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      setSetting(db, 'order_deadline', order_deadline);
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

    if (pickup_address !== undefined || pickup_time !== undefined) {
      if (pickup_address !== undefined && typeof pickup_address !== 'string') {
        return res.status(400).json({ error: 'pickup_address doit être une chaîne (vide autorisée).' });
      }
      if (pickup_time !== undefined && typeof pickup_time !== 'string') {
        return res.status(400).json({ error: 'pickup_time doit être une chaîne (vide autorisée).' });
      }
      // pickup_address/pickup_time sont propres à une campagne (saison), pas
      // au singleton `settings` (.ai/decisions.md) : rattachées à la saison
      // fournie dans cette même requête, sinon à la saison déjà configurée.
      const targetSeason = season !== undefined ? season : getSetting(db, 'season');
      if (!targetSeason) {
        return res.status(400).json({ error: 'season doit être configurée avant pickup_address/pickup_time.' });
      }
      upsertCampaign(db, targetSeason, { pickup_address, pickup_time });
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
