import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed, PLACEHOLDER_PRODUCTS } from '../src/db/seed.js';

let db;

beforeEach(() => {
  db = getDb(':memory:');
  migrate(db);
});

afterEach(() => {
  db.close();
});

function insertCustomer(overrides = {}) {
  const customer = {
    first_name: 'Jeanne',
    last_name: 'Dupont',
    phone: '0612345678',
    ...overrides,
  };
  const { lastInsertRowid } = db
    .prepare('INSERT INTO customers (first_name, last_name, phone) VALUES (@first_name, @last_name, @phone)')
    .run(customer);
  return lastInsertRowid;
}

function insertOrder(customerId, overrides = {}) {
  const order = {
    customer_id: customerId,
    season: '2026',
    total_cents: 1000,
    ...overrides,
  };
  return db
    .prepare(
      'INSERT INTO orders (customer_id, season, total_cents) VALUES (@customer_id, @season, @total_cents)'
    )
    .run(order);
}

describe('migrate', () => {
  it('crée les 5 tables attendues', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(['products', 'settings', 'customers', 'orders', 'order_items'])
    );
  });

  it('est idempotente (ré-exécution sans erreur)', () => {
    expect(() => migrate(db)).not.toThrow();
  });
});

describe('contraintes products', () => {
  it('rejette un id dupliqué', () => {
    db.prepare('INSERT INTO products (id, name, price_per_kg) VALUES (?, ?, ?)').run('blanc', 'Boudin blanc', 1000);
    expect(() =>
      db.prepare('INSERT INTO products (id, name, price_per_kg) VALUES (?, ?, ?)').run('blanc', 'Doublon', 1000)
    ).toThrow();
  });

  it('rejette un prix négatif', () => {
    expect(() =>
      db.prepare('INSERT INTO products (id, name, price_per_kg) VALUES (?, ?, ?)').run('blanc', 'Boudin blanc', -1)
    ).toThrow();
  });
});

describe('contraintes customers', () => {
  it('rejette un téléphone dupliqué', () => {
    insertCustomer();
    expect(() => insertCustomer()).toThrow();
  });
});

describe('contraintes orders', () => {
  it('rejette une quantité_500g à 0 dans order_items', () => {
    db.prepare('INSERT INTO products (id, name, price_per_kg) VALUES (?, ?, ?)').run('blanc', 'Boudin blanc', 1000);
    const customerId = insertCustomer();
    const { lastInsertRowid: orderId } = insertOrder(customerId);
    expect(() =>
      db
        .prepare(
          'INSERT INTO order_items (order_id, product_id, quantity_500g, unit_price_cents, line_total_cents) VALUES (?, ?, ?, ?, ?)'
        )
        .run(orderId, 'blanc', 0, 500, 0)
    ).toThrow();
  });

  it('rejette un total_cents négatif', () => {
    const customerId = insertCustomer();
    expect(() => insertOrder(customerId, { total_cents: -1 })).toThrow();
  });

  it('rejette un statut hors liste autorisée', () => {
    const customerId = insertCustomer();
    expect(() =>
      db
        .prepare('INSERT INTO orders (customer_id, season, total_cents, status) VALUES (?, ?, ?, ?)')
        .run(customerId, '2026', 1000, 'annulee')
    ).toThrow();
  });

  it('rejette une 2e commande du même client sur la même saison (décision C)', () => {
    const customerId = insertCustomer();
    insertOrder(customerId, { season: '2026' });
    expect(() => insertOrder(customerId, { season: '2026' })).toThrow();
  });

  it('autorise une 2e commande du même client sur une saison différente', () => {
    const customerId = insertCustomer();
    insertOrder(customerId, { season: '2026' });
    expect(() => insertOrder(customerId, { season: '2027' })).not.toThrow();
  });
});

describe('seed', () => {
  it('insère les produits placeholder', () => {
    seed(db);
    const products = db.prepare('SELECT id FROM products ORDER BY id').all().map((r) => r.id);
    expect(products).toEqual(PLACEHOLDER_PRODUCTS.map((p) => p.id).sort());
  });

  it('est idempotent (ré-exécution sans erreur ni doublon)', () => {
    seed(db);
    expect(() => seed(db)).not.toThrow();
    const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    expect(count).toBe(PLACEHOLDER_PRODUCTS.length);
  });
});
