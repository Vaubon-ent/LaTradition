require('dotenv').config();
const path = require('path');
const { createApp } = require('./app');
const { getDb } = require('./db/connection');
const { migrate } = require('./db/migrate');

const port = process.env.PORT || 3000;
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'boudins.db');
const nonceSecret = process.env.NONCE_SECRET;
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
const adminJwtSecret = process.env.ADMIN_JWT_SECRET;
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const minDelayMs = process.env.MIN_DELAY_MS ? Number(process.env.MIN_DELAY_MS) : undefined;

if (!allowedOrigin) {
  console.warn('ALLOWED_ORIGIN non défini : toute requête cross-origin (Netlify) sera refusée.');
}

if (!nonceSecret) {
  throw new Error('NONCE_SECRET manquant dans .env');
}
if (!adminPasswordHash) {
  throw new Error('ADMIN_PASSWORD_HASH manquant dans .env');
}
if (!adminJwtSecret) {
  throw new Error('ADMIN_JWT_SECRET manquant dans .env');
}

const db = getDb(dbPath);
migrate(db);

const app = createApp({ db, nonceSecret, minDelayMs, adminPasswordHash, adminJwtSecret, allowedOrigin });

app.listen(port, '127.0.0.1', () => {
  console.log(`Backend listening on http://127.0.0.1:${port}`);
});
