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

  it('ajoute la colonne orders.option (défaut \'\', ré-exécution idempotente)', () => {
    const columns = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
    expect(columns).toContain('option');

    migrate(db); // ré-exécution : ne doit pas tenter un second ALTER TABLE (colonne déjà présente)
    const columnsAfter = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
    expect(columnsAfter.filter((name) => name === 'option')).toHaveLength(1);

    const customerId = insertCustomer();
    insertOrder(customerId);
    expect(db.prepare('SELECT option FROM orders').get().option).toBe('');
  });

  it('rejette une valeur d\'option hors de la liste autorisée', () => {
    const customerId = insertCustomer();
    expect(() =>
      db
        .prepare('INSERT INTO orders (customer_id, season, total_cents, option) VALUES (?, ?, ?, ?)')
        .run(customerId, '2026', 1000, 'extra_sel')
    ).toThrow();
  });

  it('ajoute paid_status (défaut en_attente) et picked_up (défaut 0) pour une commande neuve', () => {
    const customerId = insertCustomer();
    insertOrder(customerId);
    const order = db.prepare('SELECT paid_status, picked_up FROM orders').get();
    expect(order.paid_status).toBe('en_attente');
    expect(order.picked_up).toBe(0);
  });

  it('rejette un paid_status hors de la liste autorisée', () => {
    const customerId = insertCustomer();
    expect(() =>
      db
        .prepare('INSERT INTO orders (customer_id, season, total_cents, paid_status) VALUES (?, ?, ?, ?)')
        .run(customerId, '2026', 1000, 'peut-etre')
    ).toThrow();
  });

  it(
    'backfill paid_status/picked_up depuis l\'ancien status au premier ajout des colonnes ' +
      '(migration production, .ai/decisions.md 2026-11-10 — recue→non/0, payee→oui/0, retiree→oui/1)',
    () => {
      // Simule une base déjà en production, créée avant l'introduction de ces
      // colonnes (uniquement les champs strictement nécessaires au test).
      const legacyDb = getDb(':memory:');
      legacyDb.exec(`
        CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, phone TEXT UNIQUE);
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL REFERENCES customers(id),
          season TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'recue' CHECK (status IN ('recue', 'payee', 'retiree')),
          total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      let phoneCounter = 0;
      const insertLegacyOrder = (status) => {
        phoneCounter += 1;
        const customerId = legacyDb
          .prepare('INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?)')
          .run('X', 'Y', `060000000${phoneCounter}`).lastInsertRowid;
        legacyDb
          .prepare('INSERT INTO orders (customer_id, season, status, total_cents) VALUES (?, ?, ?, ?)')
          .run(customerId, '2026', status, 1000);
      };
      insertLegacyOrder('recue');
      insertLegacyOrder('payee');
      insertLegacyOrder('retiree');

      migrate(legacyDb); // ajoute paid_status/picked_up + backfill unique

      const rows = legacyDb.prepare('SELECT status, paid_status, picked_up FROM orders ORDER BY id').all();
      expect(rows).toEqual([
        { status: 'recue', paid_status: 'non', picked_up: 0 },
        { status: 'payee', paid_status: 'oui', picked_up: 0 },
        { status: 'retiree', paid_status: 'oui', picked_up: 1 },
      ]);

      legacyDb.close();
    }
  );

  it('ne re-backfille jamais après le premier ajout : ne doit pas écraser un choix admin fait entre-temps', () => {
    const customerId = insertCustomer();
    insertOrder(customerId);
    const orderId = db.prepare('SELECT id FROM orders').get().id;
    // status='retiree' impliquerait paid_status='oui' si le backfill se redéclenchait —
    // simule une correction manuelle de l'admin après le backfill initial.
    db.prepare("UPDATE orders SET status = 'retiree', paid_status = 'non' WHERE id = ?").run(orderId);

    migrate(db); // ré-exécution (ex. redémarrage du serveur)

    expect(db.prepare('SELECT paid_status FROM orders WHERE id = ?').get(orderId).paid_status).toBe('non');
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
