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
  toDraft,
  applyDraft,
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

  it('applyDraft restores step/pii/items without touching the rest', () => {
    const state = { ...createInitialState(), nonce: 'keep-me', products: [{ id: 'x' }] };
    const restored = applyDraft(state, { step: 3, pii: { first_name: 'Jean' }, items: { blanc: 1.5 } });
    expect(restored.step).toBe(3);
    expect(restored.pii.first_name).toBe('Jean');
    expect(restored.items.blanc).toBe(1.5);
    expect(restored.nonce).toBe('keep-me');
    expect(restored.products).toEqual([{ id: 'x' }]);
  });

  it('is a no-op when there is no draft', () => {
    const state = createInitialState();
    expect(applyDraft(state, null)).toBe(state);
  });
});
