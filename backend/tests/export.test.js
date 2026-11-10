import { describe, it, expect, afterEach } from 'vitest';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { findOrCreateCustomer } from '../src/db/customersRepo.js';
import { createOrder } from '../src/db/ordersRepo.js';
import { buildExportRows, buildCsv, COLUMNS } from '../src/services/export.js';

function seedOneOrder(db) {
  const customerId = findOrCreateCustomer(db, { first_name: 'Jeanne', last_name: 'Dupont', phone: '0612345678' });
  createOrder(db, {
    customerId,
    season: '2026',
    lines: [{ product_id: 'blanc', quantity_500g: 2, unit_price_cents: 500, line_total_cents: 1000 }],
    totalCents: 1000,
  });
}

describe('services/export', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('buildExportRows produit une ligne par produit commandé avec les bonnes conversions', () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);

    const rows = buildExportRows(db, '2026');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '0612345678',
      product_name: 'Boudin blanc',
      quantity_500g: 2,
      quantity_g: 1000,
      line_total_euros: 10,
      paid: 'En attente', // paid_status par défaut d'une commande neuve (.ai/decisions.md 2026-11-10)
      picked_up: 'Non',
    });
  });

  it('buildExportRows ne renvoie rien pour une saison sans commande', () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);

    expect(buildExportRows(db, '2099')).toHaveLength(0);
  });

  it('buildCsv commence par un BOM UTF-8 et utilise `;` comme séparateur', () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);

    const csv = buildCsv(buildExportRows(db, '2026'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\n');
    expect(lines[0].split(';')).toHaveLength(COLUMNS.length);
    expect(lines[1]).toContain('Dupont');
    expect(lines[1]).toContain('Jeanne');
  });

  it('buildCsv échappe les valeurs contenant `;` ou des guillemets', () => {
    const csv = buildCsv([{ created_at: 'x', first_name: 'Jean;Pierre', last_name: 'D"upont', phone: '', product_name: '', quantity_500g: 0, quantity_g: 0, line_total_euros: 0, paid: '', picked_up: '' }]);
    expect(csv).toContain('"Jean;Pierre"');
    expect(csv).toContain('"D""upont"');
  });
});
