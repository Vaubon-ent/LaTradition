const express = require('express');
const { anonymizeCustomer } = require('../../db/customersRepo');

function createAdminCustomersRouter({ db }) {
  const router = express.Router();

  router.post('/:id/anonymize', (req, res) => {
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }
    anonymizeCustomer(db, req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminCustomersRouter };
