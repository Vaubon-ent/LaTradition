import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  goToStep,
  nextStep,
  previousStep,
  setProductQuantity,
  incrementProductQuantity,
  decrementProductQuantity,
  hasAnyQuantity,
  setOption,
  toDraft,
  applyDraft,
  formatKgLabel,
  estimateLineCents,
} from '../js/state.js';

describe('step navigation', () => {
  it('clamps step to [1,5]', () => {
    expect(goToStep(createInitialState(), 0).step).toBe(1);
    expect(goToStep(createInitialState(), 6).step).toBe(5);
    expect(goToStep(createInitialState(), 3).step).toBe(3);
  });

  it('never goes below step 1 or above step 5', () => {
    let state = createInitialState();
    state = previousStep(state);
    expect(state.step).toBe(1);
    state = { ...state, step: 5 };
    state = nextStep(state);
    expect(state.step).toBe(5);
  });
});

describe('product quantities (pas de 0,5 kg)', () => {
  it('increments by 0.5 kg', () => {
    let state = createInitialState();
    state = incrementProductQuantity(state, 'blanc');
    expect(state.items.blanc).toBe(0.5);
    state = incrementProductQuantity(state, 'blanc');
    expect(state.items.blanc).toBe(1);
  });

  it('never goes below 0', () => {
    let state = createInitialState();
    state = decrementProductQuantity(state, 'blanc');
    expect(state.items.blanc).toBeUndefined();
    state = setProductQuantity(state, 'blanc', -3);
    expect(state.items.blanc).toBeUndefined();
  });

  it('rounds an arbitrary quantity to the nearest 0.5 kg step', () => {
    const state = setProductQuantity(createInitialState(), 'noir', 1.3);
    expect(state.items.noir).toBe(1.5);
  });

  it('hasAnyQuantity is false when all quantities are 0', () => {
    expect(hasAnyQuantity(createInitialState())).toBe(false);
    const withQty = incrementProductQuantity(createInitialState(), 'blanc');
    expect(hasAnyQuantity(withQty)).toBe(true);
    const backToZero = decrementProductQuantity(withQty, 'blanc');
    expect(hasAnyQuantity(backToZero)).toBe(false);
  });
});

describe('draft projection (F7)', () => {
  it('never includes the nonce or the product list', () => {
    let state = createInitialState();
    state = { ...state, nonce: 'secret-nonce', products: [{ id: 'blanc' }] };
    const draft = toDraft(state);
    expect(draft.nonce).toBeUndefined();
    expect(draft.products).toBeUndefined();
  });

  it('inclut l\'option de commande', () => {
    const state = setOption(createInitialState(), 'plus_piment');
    expect(toDraft(state).option).toBe('plus_piment');
  });

  it('applyDraft restores step/pii/items/option without touching the rest', () => {
    const state = { ...createInitialState(), nonce: 'keep-me', products: [{ id: 'x' }] };
    const restored = applyDraft(state, {
      step: 3,
      pii: { first_name: 'Jean' },
      items: { blanc: 1.5 },
      option: 'moins_piment',
    });
    expect(restored.step).toBe(3);
    expect(restored.pii.first_name).toBe('Jean');
    expect(restored.items.blanc).toBe(1.5);
    expect(restored.option).toBe('moins_piment');
    expect(restored.nonce).toBe('keep-me');
    expect(restored.products).toEqual([{ id: 'x' }]);
  });

  it('applyDraft défaut à une option vide quand absente du brouillon', () => {
    const restored = applyDraft(createInitialState(), { step: 2, pii: {}, items: {} });
    expect(restored.option).toBe('');
  });

  it('is a no-op when there is no draft', () => {
    const state = createInitialState();
    expect(applyDraft(state, null)).toBe(state);
  });
});

describe('formatKgLabel (M-FR1)', () => {
  it('affiche un entier sans décimale', () => {
    expect(formatKgLabel(2)).toBe('2');
  });

  it('remplace le point par une virgule pour une quantité décimale', () => {
    expect(formatKgLabel(1.5)).toBe('1,5');
  });
});

describe('estimateLineCents (M-FR1 — miroir exact de la formule serveur)', () => {
  it('calcule une estimation pour une quantité entière', () => {
    // 10,00 €/kg -> 500 c/500g, 2 kg -> 4 x 500g
    expect(estimateLineCents({ price_per_kg: 1000 }, 2)).toBe(2000);
  });

  it('calcule une estimation pour une quantité à 0,5 kg', () => {
    expect(estimateLineCents({ price_per_kg: 1000 }, 0.5)).toBe(500);
  });

  it('ne diverge jamais du total serveur pour un prix en centimes impair (double arrondi)', () => {
    // price_per_kg = 1401 -> unitPriceCents serveur = round(1401/2) = 701
    // Un calcul naïf (price_per_kg * quantityKg, sans passer par le prix au
    // 500g arrondi) donnerait 1401 * 1.5 = 2101.5 -> un arrondi différent.
    const product = { price_per_kg: 1401 };
    expect(estimateLineCents(product, 1.5)).toBe(2103); // 3 x 701
  });
});
