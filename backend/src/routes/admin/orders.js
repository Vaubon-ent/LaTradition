const express = require('express');
const { listOrders, updateOrderStatus, ORDER_STATUSES } = require('../../db/ordersRepo');
const { getSetting } = require('../../db/settingsRepo');

function createAdminOrdersRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { status, search } = req.query;
    const season = req.query.season || getSetting(db, 'season');

    if (status && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Statut invalide : ${status}` });
    }

    const orders = listOrders(db, { status, season, search });
    res.json({ orders });
  });

  router.patch('/:id/status', (req, res) => {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Statut invalide : ${status}` });
    }

    const updated = updateOrderStatus(db, req.params.id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminOrdersRouter };
