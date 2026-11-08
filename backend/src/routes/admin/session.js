const express = require('express');

function createAdminSessionRouter() {
  const router = express.Router();

  router.get('/session', (req, res) => {
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminSessionRouter };
