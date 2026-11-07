const express = require('express');
const { buildExportRows, buildXlsxBuffer, buildCsv } = require('../../services/export');
const { getSetting } = require('../../db/settingsRepo');

function createAdminExportRouter({ db }) {
  const router = express.Router();

  router.get('/export.xlsx', async (req, res) => {
    const season = req.query.season || getSetting(db, 'season');
    const rows = buildExportRows(db, season);
    const buffer = await buildXlsxBuffer(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="commandes-${season}.xlsx"`);
    res.send(buffer);
  });

  router.get('/export.csv', (req, res) => {
    const season = req.query.season || getSetting(db, 'season');
    const rows = buildExportRows(db, season);
    const csv = buildCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="commandes-${season}.csv"`);
    res.send(csv);
  });

  return router;
}

module.exports = { createAdminExportRouter };
