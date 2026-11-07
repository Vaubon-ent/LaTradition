const express = require('express');
const { getProductionTotals } = require('../../db/ordersRepo');
const { getSetting } = require('../../db/settingsRepo');

function createAdminProductionRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const season = req.query.season || getSetting(db, 'season');
    res.json({ season, totals: getProductionTotals(db, season) });
  });

  return router;
}

module.exports = { createAdminProductionRouter };
