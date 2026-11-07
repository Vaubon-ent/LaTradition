const express = require('express');
const { getLockInfo } = require('../services/dates');
const { buildOrderItems, computeOrderTotalCents, OrderValidationError } = require('../services/pricing');
const { validateCustomerInput, ValidationError } = require('../services/validation');
const { createAntiAbuseGuard } = require('../middleware/antiAbuseGuard');
const { getSetting } = require('../db/settingsRepo');
const { getActiveProductsById } = require('../db/productsRepo');
const { findOrCreateCustomer } = require('../db/customersRepo');
const { createOrder, DuplicateOrderError } = require('../db/ordersRepo');

function createOrdersRouter({ db, nonceSecret, minDelayMs }) {
  const router = express.Router();
  const antiAbuseGuard = createAntiAbuseGuard({ db, secret: nonceSecret, minDelayMs });

  router.post('/', antiAbuseGuard, (req, res) => {
    const conceptionDate = getSetting(db, 'conception_date');
    const season = getSetting(db, 'season');
    if (!conceptionDate || !season) {
      return res.status(500).json({ error: 'Configuration manquante.' });
    }

    if (getLockInfo(conceptionDate).locked) {
      return res.status(403).json({ error: 'La date limite de commande est dépassée.' });
    }

    try {
      const customerInput = validateCustomerInput(req.body);
      const productsById = getActiveProductsById(db);
      const lines = buildOrderItems(req.body.items || [], productsById);
      const totalCents = computeOrderTotalCents(lines);

      const customerId = findOrCreateCustomer(db, customerInput);
      createOrder(db, { customerId, season, lines, totalCents });

      res.status(201).json({ total_cents: totalCents, conception_date: conceptionDate });
    } catch (err) {
      if (err instanceof ValidationError || err instanceof OrderValidationError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof DuplicateOrderError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  return router;
}

module.exports = { createOrdersRouter };
