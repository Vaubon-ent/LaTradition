import { describe, it, expect } from 'vitest';
import {
  PRODUCT_COLUMNS,
  kgForProduct,
  isPaid,
  isPickedUp,
  statusAfterPaidToggle,
  statusAfterPickedUpToggle,
  formatDate,
  formatKg,
  matchesFilters,
} from '../admin/js/ordersData.js';

function makeOrder(overrides = {}) {
  return {
    id: 1,
    season: '2026',
    status: 'recue',
    created_at: '2026-11-08 14:32:00',
    first_name: 'Jeanne',
    last_name: 'Dupont',
    phone: '0612345678',
    items: [],
    ...overrides,
  };
}

describe('ordersData.kgForProduct', () => {
  it('additionne les lignes correspondant au produit demandé (converties en kg)', () => {
    const order = makeOrder({
      items: [
        { product_id: 'noir', quantity_500g: 2 },
        { product_id: 'noir', quantity_500g: 1 },
        { product_id: 'blanc', quantity_500g: 4 },
      ],
    });
    expect(kgForProduct(order, 'noir')).toBe(1.5);
  });

  it('renvoie 0 pour une commande sans ligne de ce produit', () => {
    const order = makeOrder({ items: [{ product_id: 'blanc', quantity_500g: 2 }] });
    expect(kgForProduct(order, 'blanc_morue')).toBe(0);
  });
});

describe('ordersData.isPaid / isPickedUp', () => {
  it.each([
    ['recue', false, false],
    ['payee', true, false],
    ['retiree', true, true],
  ])('status=%s → payé=%s, récupéré=%s', (status, paid, pickedUp) => {
    expect(isPaid(status)).toBe(paid);
    expect(isPickedUp(status)).toBe(pickedUp);
  });
});

describe('ordersData.statusAfterPaidToggle', () => {
  it('cocher Payé depuis recue → payee', () => {
    expect(statusAfterPaidToggle('recue', true)).toBe('payee');
  });
  it('cocher Payé alors que déjà payee → no-op', () => {
    expect(statusAfterPaidToggle('payee', true)).toBe('payee');
  });
  it('cocher Payé alors que déjà retiree → no-op (case désactivée côté vue)', () => {
    expect(statusAfterPaidToggle('retiree', true)).toBe('retiree');
  });
  it('décocher Payé depuis payee → recue', () => {
    expect(statusAfterPaidToggle('payee', false)).toBe('recue');
  });
  it('décocher Payé alors que déjà recue → no-op', () => {
    expect(statusAfterPaidToggle('recue', false)).toBe('recue');
  });
  it('décocher Payé depuis retiree → no-op (case désactivée côté vue)', () => {
    expect(statusAfterPaidToggle('retiree', false)).toBe('retiree');
  });
});

describe('ordersData.statusAfterPickedUpToggle', () => {
  it('cocher Récupéré depuis recue → retiree (implique payé)', () => {
    expect(statusAfterPickedUpToggle('recue', true)).toBe('retiree');
  });
  it('cocher Récupéré depuis payee → retiree', () => {
    expect(statusAfterPickedUpToggle('payee', true)).toBe('retiree');
  });
  it('décocher Récupéré depuis retiree → payee (reste payé)', () => {
    expect(statusAfterPickedUpToggle('retiree', false)).toBe('payee');
  });
  it('décocher Récupéré alors que déjà non récupéré → no-op', () => {
    expect(statusAfterPickedUpToggle('recue', false)).toBe('recue');
    expect(statusAfterPickedUpToggle('payee', false)).toBe('payee');
  });
});

describe('ordersData.formatDate / formatKg', () => {
  it('formatDate renvoie une chaîne non vide pour une date valide', () => {
    expect(formatDate('2026-11-08 14:32:00')).toContain('2026');
  });
  it('formatDate renvoie une chaîne vide pour une valeur absente', () => {
    expect(formatDate(null)).toBe('');
  });
  it('formatKg utilise la notation française (virgule)', () => {
    expect(formatKg(1.5)).toBe('1,5');
  });
});

describe('ordersData.matchesFilters', () => {
  const order = makeOrder({
    status: 'payee',
    items: [{ product_id: 'noir', quantity_500g: 3 }],
  });
  const noFilters = { last_name: '', first_name: '', phone: '', created_at: '', kg: {}, paid: 'all', pickedUp: 'all' };

  it('aucun filtre → correspond toujours', () => {
    expect(matchesFilters(order, noFilters)).toBe(true);
  });

  it('filtre texte nom partiel et insensible à la casse', () => {
    expect(matchesFilters(order, { ...noFilters, last_name: 'dup' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, last_name: 'martin' })).toBe(false);
  });

  it('filtre téléphone partiel', () => {
    expect(matchesFilters(order, { ...noFilters, phone: '2345' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, phone: '9999' })).toBe(false);
  });

  it('filtre kg par produit', () => {
    expect(matchesFilters(order, { ...noFilters, kg: { noir: '1,5' } })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, kg: { noir: '9' } })).toBe(false);
  });

  it('filtre payé (tous/oui/non)', () => {
    expect(matchesFilters(order, { ...noFilters, paid: 'yes' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, paid: 'no' })).toBe(false);
  });

  it('filtre récupéré (tous/oui/non)', () => {
    expect(matchesFilters(order, { ...noFilters, pickedUp: 'no' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, pickedUp: 'yes' })).toBe(false);
  });

  it('plusieurs filtres combinés (tous doivent correspondre)', () => {
    expect(matchesFilters(order, { ...noFilters, last_name: 'dup', paid: 'yes', pickedUp: 'no' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, last_name: 'dup', paid: 'yes', pickedUp: 'yes' })).toBe(false);
  });
});

describe('ordersData.PRODUCT_COLUMNS', () => {
  it('expose les 3 types de boudin dans le bon ordre', () => {
    expect(PRODUCT_COLUMNS.map((c) => c.id)).toEqual(['noir', 'blanc', 'blanc_morue']);
  });
});
