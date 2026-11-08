const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createProductsRouter } = require('./routes/products');
const { createSettingsRouter } = require('./routes/settings');
const { createOrdersRouter } = require('./routes/orders');
const { createCheckPhoneRouter } = require('./routes/checkPhone');
const { createAdminAuthRouter } = require('./routes/admin/auth');
const { createAdminOrdersRouter } = require('./routes/admin/orders');
const { createAdminProductionRouter } = require('./routes/admin/production');
const { createAdminExportRouter } = require('./routes/admin/export');
const { createAdminProductsRouter } = require('./routes/admin/products');
const { createAdminSettingsRouter } = require('./routes/admin/settings');
const { createAdminCustomersRouter } = require('./routes/admin/customers');
const { createAdminSessionRouter } = require('./routes/admin/session');
const { requireAdminAuth } = require('./middleware/requireAdminAuth');
const { createCorsGuard } = require('./middleware/corsGuard');
const { errorHandler } = require('./middleware/errorHandler');

const DEFAULT_ADMIN_TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12h
const DEFAULT_ADMIN_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_ADMIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 min

function createApp({
  db,
  nonceSecret,
  minDelayMs,
  adminPasswordHash,
  adminJwtSecret,
  adminTokenTtlSeconds = DEFAULT_ADMIN_TOKEN_TTL_SECONDS,
  adminMaxLoginAttempts = DEFAULT_ADMIN_MAX_LOGIN_ATTEMPTS,
  adminLockDurationMs = DEFAULT_ADMIN_LOCK_DURATION_MS,
  allowedOrigin,
  exportsDir,
}) {
  const app = express();

  app.use(helmet());
  // Bloque par défaut tant que allowedOrigin n'est pas configuré (M9,
  // décision du 2026-11-07) : plus sûr que d'autoriser largement en attendant
  // le déploiement Netlify réel.
  app.use(createCorsGuard(allowedOrigin));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/products', createProductsRouter(db));
  app.use('/api/settings', createSettingsRouter({ db, nonceSecret }));
  app.use('/api/orders', createOrdersRouter({ db, nonceSecret, minDelayMs }));
  app.use('/api/check-phone', createCheckPhoneRouter({ db, nonceSecret }));

  const adminConfig = { db, adminPasswordHash, adminJwtSecret, adminTokenTtlSeconds, adminMaxLoginAttempts, adminLockDurationMs };
  app.use('/api/admin', createAdminAuthRouter(adminConfig));
  app.use('/api/admin', requireAdminAuth(adminJwtSecret));
  app.use('/api/admin', createAdminSessionRouter());
  app.use('/api/admin/orders', createAdminOrdersRouter({ db }));
  app.use('/api/admin/production', createAdminProductionRouter({ db }));
  app.use('/api/admin', createAdminExportRouter({ db, exportsDir }));
  app.use('/api/admin/products', createAdminProductsRouter({ db }));
  app.use('/api/admin/settings', createAdminSettingsRouter({ db }));
  app.use('/api/admin/customers', createAdminCustomersRouter({ db }));

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
