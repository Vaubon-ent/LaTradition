import { describe, it, expect } from 'vitest';
import {
  OrderValidationError,
  buildOrderItems,
  computeOrderTotalCents,
  buildUpdatedOrderItems,
} from '../src/services/pricing.js';

const productsById = {
  blanc: { price_per_kg: 1000, active: 1 },
  blanc_morue: { price_per_kg: 1100, active: 1 },
  noir: { price_per_kg: 666, active: 1 },
  inactif: { price_per_kg: 200, active: 0 },
};

describe('buildOrderItems', () => {
  it('rejette une commande où toutes les quantités sont à 0', () => {
    expect(() =>
      buildOrderItems(
        [{ product_id: 'blanc', quantity_500g: 0 }, { product_id: 'noir', quantity_500g: 0 }],
        productsById
      )
    ).toThrow(OrderValidationError);
  });

  it('ignore les lignes à quantité 0 et garde les lignes positives', () => {
    const lines = buildOrderItems(
      [
        { product_id: 'blanc', quantity_500g: 0 },
        { product_id: 'noir', quantity_500g: 3 },
      ],
      productsById
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      product_id: 'noir',
      quantity_500g: 3,
      unit_price_cents: 333,
      line_total_cents: 999,
    });
  });

  it('calcule correctement le total sur plusieurs lignes, en centimes entiers', () => {
    const lines = buildOrderItems(
      [
        { product_id: 'blanc', quantity_500g: 2 },
        { product_id: 'blanc_morue', quantity_500g: 1 },
        { product_id: 'noir', quantity_500g: 3 },
      ],
      productsById
    );
    expect(computeOrderTotalCents(lines)).toBe(2 * 500 + 1 * 550 + 3 * 333);
    expect(Number.isInteger(computeOrderTotalCents(lines))).toBe(true);
  });

  it('rejette un produit inconnu', () => {
    expect(() =>
      buildOrderItems([{ product_id: 'inexistant', quantity_500g: 1 }], productsById)
    ).toThrow(OrderValidationError);
  });

  it('rejette un produit désactivé', () => {
    expect(() =>
      buildOrderItems([{ product_id: 'inactif', quantity_500g: 1 }], productsById)
    ).toThrow(OrderValidationError);
  });

  it('figer le prix unitaire au moment du calcul : une modification ultérieure du produit ne change pas la ligne déjà construite', () => {
    const isolatedProducts = { blanc: { price_per_kg: 1000, active: 1 } };
    const lines = buildOrderItems([{ product_id: 'blanc', quantity_500g: 1 }], isolatedProducts);
    isolatedProducts.blanc.price_per_kg = 999999;
    expect(lines[0].unit_price_cents).toBe(500);
    expect(lines[0].line_total_cents).toBe(500);
  });

  it('arrondit de façon déterministe un prix au kg impair en centimes', () => {
    const lines = buildOrderItems(
      [{ product_id: 'impair', quantity_500g: 2 }],
      { impair: { price_per_kg: 1001, active: 1 } }
    );
    // Math.round(1001 / 2) = Math.round(500.5) = 501
    expect(lines[0].unit_price_cents).toBe(501);
    expect(lines[0].line_total_cents).toBe(1002);
  });
});

describe('buildUpdatedOrderItems', () => {
  const existingItems = [
    { id: 11, product_id: 'blanc', quantity_500g: 2, unit_price_cents: 500 },
    { id: 12, product_id: 'noir', quantity_500g: 1, unit_price_cents: 333 },
  ];

  it('modifie la quantité d\'une ligne existante en conservant son prix unitaire figé', () => {
    const diff = buildUpdatedOrderItems(
      existingItems,
      [{ product_id: 'blanc', quantity_500g: 5 }, { product_id: 'noir', quantity_500g: 1 }],
      productsById
    );
    expect(diff.updates).toEqual([
      { id: 11, quantity_500g: 5, line_total_cents: 2500 },
      { id: 12, quantity_500g: 1, line_total_cents: 333 },
    ]);
    expect(diff.inserts).toHaveLength(0);
    expect(diff.deleteIds).toHaveLength(0);
    expect(diff.totalCents).toBe(2500 + 333);
  });

  it('supprime une ligne absente de la demande (quantité 0 ou produit retiré)', () => {
    const diff = buildUpdatedOrderItems(
      existingItems,
      [{ product_id: 'blanc', quantity_500g: 0 }, { product_id: 'noir', quantity_500g: 1 }],
      productsById
    );
    expect(diff.deleteIds).toEqual([11]);
    expect(diff.updates).toEqual([{ id: 12, quantity_500g: 1, line_total_cents: 333 }]);
  });

  it('ajoute une ligne pour un nouveau produit, prix dérivé du price_per_kg actuel (pas de prix figé à conserver)', () => {
    const diff = buildUpdatedOrderItems(
      existingItems,
      [
        { product_id: 'blanc', quantity_500g: 2 },
        { product_id: 'noir', quantity_500g: 1 },
        { product_id: 'blanc_morue', quantity_500g: 1 },
      ],
      productsById
    );
    expect(diff.inserts).toEqual([
      { product_id: 'blanc_morue', quantity_500g: 1, unit_price_cents: 550, line_total_cents: 550 },
    ]);
    expect(diff.totalCents).toBe(1000 + 333 + 550);
  });

  it('rejette un nouveau produit inconnu ou désactivé', () => {
    expect(() =>
      buildUpdatedOrderItems(existingItems, [{ product_id: 'inexistant', quantity_500g: 1 }], productsById)
    ).toThrow(OrderValidationError);
    expect(() =>
      buildUpdatedOrderItems(existingItems, [{ product_id: 'inactif', quantity_500g: 1 }], productsById)
    ).toThrow(OrderValidationError);
  });

  it('rejette si plus aucune ligne positive après le diff (toutes retirées)', () => {
    expect(() =>
      buildUpdatedOrderItems(
        existingItems,
        [{ product_id: 'blanc', quantity_500g: 0 }, { product_id: 'noir', quantity_500g: 0 }],
        productsById
      )
    ).toThrow(OrderValidationError);
  });

  it('un produit existant devenu inactif reste modifiable en quantité (pas de nouvelle validation d\'activité sur une ligne déjà figée)', () => {
    const diff = buildUpdatedOrderItems(
      [{ id: 21, product_id: 'inactif', quantity_500g: 1, unit_price_cents: 100 }],
      [{ product_id: 'inactif', quantity_500g: 4 }],
      productsById
    );
    expect(diff.updates).toEqual([{ id: 21, quantity_500g: 4, line_total_cents: 400 }]);
  });
});
