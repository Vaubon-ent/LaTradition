const express = require('express');
const { getActiveProducts } = require('../db/productsRepo');

function createProductsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ products: getActiveProducts(db) });
  });

  return router;
}

module.exports = { createProductsRouter };
