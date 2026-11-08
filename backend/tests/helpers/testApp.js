const bcrypt = require('bcryptjs');
const { getDb } = require('../../src/db/connection');
const { migrate } = require('../../src/db/migrate');
const { seed } = require('../../src/db/seed');
const { createApp } = require('../../src/app');

const TEST_ADMIN_PASSWORD = 'test-admin-password';
// Coût bcrypt réduit (4 au lieu de 10) : uniquement pour que la suite de
// tests reste rapide, jamais utilisé en production (voir server.js).
const TEST_ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 4);

const TEST_ALLOWED_ORIGIN = 'https://test-season.netlify.app';

function buildTestApp({
  nonceSecret = 'test-secret',
  withSeed = true,
  minDelayMs = 0,
  adminPasswordHash = TEST_ADMIN_PASSWORD_HASH,
  adminJwtSecret = 'test-admin-secret',
  adminTokenTtlSeconds = 3600,
  adminMaxLoginAttempts = 5,
  adminLockDurationMs = 15 * 60 * 1000,
  allowedOrigin = TEST_ALLOWED_ORIGIN,
  exportsDir,
} = {}) {
  const db = getDb(':memory:');
  migrate(db);
  if (withSeed) {
    seed(db);
  }
  const app = createApp({
    db,
    nonceSecret,
    minDelayMs,
    adminPasswordHash,
    adminJwtSecret,
    adminTokenTtlSeconds,
    adminMaxLoginAttempts,
    adminLockDurationMs,
    allowedOrigin,
    exportsDir,
  });
  return { app, db, nonceSecret, adminJwtSecret };
}

module.exports = { buildTestApp, TEST_ADMIN_PASSWORD, TEST_ADMIN_PASSWORD_HASH, TEST_ALLOWED_ORIGIN };
