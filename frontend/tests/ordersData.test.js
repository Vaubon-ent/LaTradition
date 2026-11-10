import { describe, it, expect } from 'vitest';
import {
  PRODUCT_COLUMNS,
  OPTION_LABELS,
  optionLabel,
  PAID_STATUS_LABELS,
  paidStatusLabel,
  pickedUpLabel,
  kgForProduct,
  formatDate,
  formatKg,
  formatEuros,
  matchesFilters,
  sortOrders,
  roundToHalfKg,
  kgToQuantity500g,
  buildEditItemsPayload,
  computeTotals,
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
    total_cents: 1000,
    option: '',
    paid_status: 'en_attente',
    picked_up: 0,
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

describe('ordersData.paidStatusLabel / pickedUpLabel (découplage du 2026-11-10)', () => {
  it('traduit chaque valeur de paid_status en libellé affiché', () => {
    expect(paidStatusLabel('non')).toBe('Non');
    expect(paidStatusLabel('en_attente')).toBe('En attente');
    expect(paidStatusLabel('oui')).toBe('Oui');
    expect(PAID_STATUS_LABELS.en_attente).toBe('En attente');
  });

  it('traduit picked_up (booléen/0-1) en Oui/Non', () => {
    expect(pickedUpLabel(true)).toBe('Oui');
    expect(pickedUpLabel(1)).toBe('Oui');
    expect(pickedUpLabel(false)).toBe('Non');
    expect(pickedUpLabel(0)).toBe('Non');
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
  it('formatEuros convertit les centimes en euros avec 2 décimales', () => {
    expect(formatEuros(4250)).toBe('42,50');
    expect(formatEuros(0)).toBe('0,00');
  });
});

describe('ordersData.matchesFilters', () => {
  const order = makeOrder({
    paid_status: 'oui',
    picked_up: 0,
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

  it('filtre payé (tous/non/en_attente/oui), découplage du 2026-11-10', () => {
    expect(matchesFilters(order, { ...noFilters, paid: 'oui' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, paid: 'non' })).toBe(false);
    expect(matchesFilters(order, { ...noFilters, paid: 'en_attente' })).toBe(false);
  });

  it('filtre récupéré (tous/oui/non)', () => {
    expect(matchesFilters(order, { ...noFilters, pickedUp: 'no' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, pickedUp: 'yes' })).toBe(false);
  });

  it('une commande peut être récupérée sans être payée (découplage du 2026-11-10)', () => {
    const pickedUpUnpaid = makeOrder({ paid_status: 'non', picked_up: 1 });
    expect(matchesFilters(pickedUpUnpaid, { ...noFilters, paid: 'non', pickedUp: 'yes' })).toBe(true);
  });

  it('plusieurs filtres combinés (tous doivent correspondre)', () => {
    expect(matchesFilters(order, { ...noFilters, last_name: 'dup', paid: 'oui', pickedUp: 'no' })).toBe(true);
    expect(matchesFilters(order, { ...noFilters, last_name: 'dup', paid: 'oui', pickedUp: 'yes' })).toBe(false);
  });

  it('filtre option (tous/aucune/plus_piment/moins_piment), demande directe du 2026-11-10', () => {
    const withOption = makeOrder({ option: 'plus_piment' });
    expect(matchesFilters(withOption, { ...noFilters, option: 'all' })).toBe(true);
    expect(matchesFilters(withOption, { ...noFilters, option: 'plus_piment' })).toBe(true);
    expect(matchesFilters(withOption, { ...noFilters, option: 'moins_piment' })).toBe(false);
    expect(matchesFilters(withOption, { ...noFilters, option: '' })).toBe(false);
    expect(matchesFilters(order, { ...noFilters, option: '' })).toBe(true); // order a option: ''
  });
});

describe('ordersData.PRODUCT_COLUMNS', () => {
  it('expose les 3 types de boudin dans le bon ordre', () => {
    expect(PRODUCT_COLUMNS.map((c) => c.id)).toEqual(['noir', 'blanc', 'blanc_morue']);
  });
});

describe('ordersData.optionLabel / OPTION_LABELS', () => {
  it('traduit chaque valeur stockée en libellé affiché', () => {
    expect(optionLabel('')).toBe('');
    expect(optionLabel('plus_piment')).toBe('Plus de piment');
    expect(optionLabel('moins_piment')).toBe('Moins de piment');
    expect(OPTION_LABELS.plus_piment).toBe('Plus de piment');
  });
});

describe('ordersData.sortOrders', () => {
  const a = makeOrder({ id: 1, last_name: 'Martin', phone: '0600000002', items: [{ product_id: 'noir', quantity_500g: 4 }] });
  const b = makeOrder({ id: 2, last_name: 'Dupont', phone: '0600000001', items: [{ product_id: 'noir', quantity_500g: 1 }] });
  const c = makeOrder({ id: 3, last_name: 'Bernard', phone: '0600000003', items: [{ product_id: 'noir', quantity_500g: 2 }] });

  it('sans colonne de tri → ordre d\'origine inchangé', () => {
    expect(sortOrders([a, b, c], { column: null, direction: 'asc' })).toEqual([a, b, c]);
  });

  it('tri croissant sur une colonne texte (insensible à la casse)', () => {
    const sorted = sortOrders([a, b, c], { column: 'last_name', direction: 'asc' });
    expect(sorted.map((o) => o.last_name)).toEqual(['Bernard', 'Dupont', 'Martin']);
  });

  it('tri décroissant sur une colonne texte', () => {
    const sorted = sortOrders([a, b, c], { column: 'last_name', direction: 'desc' });
    expect(sorted.map((o) => o.last_name)).toEqual(['Martin', 'Dupont', 'Bernard']);
  });

  it('tri croissant/décroissant sur une colonne kg produit', () => {
    expect(sortOrders([a, b, c], { column: 'noir', direction: 'asc' }).map((o) => o.id)).toEqual([2, 3, 1]);
    expect(sortOrders([a, b, c], { column: 'noir', direction: 'desc' }).map((o) => o.id)).toEqual([1, 3, 2]);
  });

  it('tri croissant/décroissant sur le montant (total_cents)', () => {
    const cheap = makeOrder({ id: 1, total_cents: 1000 });
    const mid = makeOrder({ id: 2, total_cents: 2000 });
    const expensive = makeOrder({ id: 3, total_cents: 3000 });
    expect(sortOrders([expensive, cheap, mid], { column: 'total_cents', direction: 'asc' }).map((o) => o.id)).toEqual([1, 2, 3]);
    expect(sortOrders([expensive, cheap, mid], { column: 'total_cents', direction: 'desc' }).map((o) => o.id)).toEqual([3, 2, 1]);
  });

  it('tri sur payé (3 états, ordre non < en_attente < oui) et récupéré (découplage du 2026-11-10)', () => {
    const non = makeOrder({ id: 1, paid_status: 'non' });
    const enAttente = makeOrder({ id: 2, paid_status: 'en_attente' });
    const oui = makeOrder({ id: 3, paid_status: 'oui' });
    expect(sortOrders([oui, non, enAttente], { column: 'paid', direction: 'asc' }).map((o) => o.id)).toEqual([1, 2, 3]);

    const notPickedUp = makeOrder({ id: 1, picked_up: 0 });
    const pickedUp = makeOrder({ id: 2, picked_up: 1 });
    expect(sortOrders([pickedUp, notPickedUp], { column: 'pickedUp', direction: 'asc' })[0].id).toBe(1);
  });

  it('tri croissant sur le libellé Option (demande directe du 2026-11-10)', () => {
    const none = makeOrder({ id: 1, option: '' });
    const plus = makeOrder({ id: 2, option: 'plus_piment' });
    const moins = makeOrder({ id: 3, option: 'moins_piment' });
    // ordre alphabétique des libellés : '' < 'Moins de piment' < 'Plus de piment'
    expect(sortOrders([plus, moins, none], { column: 'option', direction: 'asc' }).map((o) => o.id)).toEqual([1, 3, 2]);
  });

  it('ne modifie pas le tableau d\'origine (immutabilité)', () => {
    const original = [a, b, c];
    sortOrders(original, { column: 'last_name', direction: 'asc' });
    expect(original).toEqual([a, b, c]);
  });
});

describe('ordersData.roundToHalfKg / kgToQuantity500g', () => {
  it('arrondit au pas de 0,5 kg le plus proche', () => {
    expect(roundToHalfKg(1.3)).toBe(1.5);
    expect(roundToHalfKg(1.2)).toBe(1);
  });

  it('ne renvoie jamais une valeur négative', () => {
    expect(roundToHalfKg(-2)).toBe(0);
  });

  it('kgToQuantity500g convertit en entier (unité stockée en base)', () => {
    expect(kgToQuantity500g(1.5)).toBe(3);
    expect(kgToQuantity500g(0)).toBe(0);
    expect(Number.isInteger(kgToQuantity500g(2.5))).toBe(true);
  });
});

describe('ordersData.buildEditItemsPayload', () => {
  it('convertit les kg par produit en quantity_500g, dans l\'ordre de PRODUCT_COLUMNS', () => {
    const payload = buildEditItemsPayload({ noir: 2, blanc: 1.5, blanc_morue: 0 });
    expect(payload).toEqual([
      { product_id: 'noir', quantity_500g: 4 },
      { product_id: 'blanc', quantity_500g: 3 },
    ]);
  });

  it('omet les produits à quantité 0 ou absente', () => {
    expect(buildEditItemsPayload({})).toEqual([]);
    expect(buildEditItemsPayload({ noir: 0 })).toEqual([]);
  });
});

describe('ordersData.computeTotals', () => {
  it('additionne nombre de commandes, montant et kg par produit (+ total global)', () => {
    const orders = [
      makeOrder({ id: 1, total_cents: 1000, items: [{ product_id: 'noir', quantity_500g: 2 }] }),
      makeOrder({ id: 2, total_cents: 2500, items: [{ product_id: 'blanc', quantity_500g: 1 }, { product_id: 'noir', quantity_500g: 1 }] }),
    ];
    const totals = computeTotals(orders);
    expect(totals.count).toBe(2);
    expect(totals.amountCents).toBe(3500);
    expect(totals.kgByProduct).toEqual({ noir: 1.5, blanc: 0.5, blanc_morue: 0 });
    expect(totals.kgTotal).toBe(2);
  });

  it('renvoie des totaux à zéro pour une liste vide', () => {
    expect(computeTotals([])).toEqual({
      count: 0,
      amountCents: 0,
      kgByProduct: { noir: 0, blanc: 0, blanc_morue: 0 },
      kgTotal: 0,
    });
  });
});
