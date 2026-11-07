const SCHEMA_SQL = `
-- price_per_kg est la source de vérité (saisie admin, .ai/decisions.md 2026-11-07) ;
-- le prix par 500g utilisé pour la facturation (order_items) est dérivé par calcul
-- au moment de la construction d'une commande (services/pricing.js), pas stocké ici.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_per_kg INTEGER NOT NULL CHECK (price_per_kg >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  season TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recue' CHECK (status IN ('recue', 'payee', 'retiree')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  paid_online INTEGER NOT NULL DEFAULT 0 CHECK (paid_online IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (customer_id, season)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity_500g INTEGER NOT NULL CHECK (quantity_500g >= 1),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

-- Nonces anti-replay consommés (décision retenue, .ai/decisions.md).
-- Table bornée dans le temps : chaque ligne expire avec le TTL du nonce,
-- purgée au fil des insertions (voir db/nonceStore.js).
CREATE TABLE IF NOT EXISTS used_nonces (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Compteur global de tentatives de connexion admin échouées (M5). Un seul
-- compte admin partagé (voir .ai/decisions.md) : pas de verrou par IP (même
-- raisonnement de rejet que pour /api/orders ne s'applique pas ici, un seul
-- utilisateur légitime), un verrou global suffit. Ligne unique (id = 1).
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);
`;

module.exports = { SCHEMA_SQL };
