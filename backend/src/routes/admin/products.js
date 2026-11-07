const express = require('express');
const { updateProduct, getProductById } = require('../../db/productsRepo');

function isValidPrice(value) {
  return Number.isInteger(value) && value >= 0;
}

function createAdminProductsRouter({ db }) {
  const router = express.Router();

  router.put('/:id', (req, res) => {
    const { price_per_kg, active } = req.body || {};

    if (!isValidPrice(price_per_kg)) {
      return res.status(400).json({ error: 'price_per_kg doit être un entier (centimes) ≥ 0.' });
    }
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active doit être un booléen.' });
    }
    if (!getProductById(db, req.params.id)) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    updateProduct(db, req.params.id, { price_per_kg, active });
    res.json({ product: getProductById(db, req.params.id) });
  });

  return router;
}

module.exports = { createAdminProductsRouter };
