import { describe, it, expect } from 'vitest';
import {
  OrderValidationError,
  buildOrderItems,
  computeOrderTotalCents,
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
