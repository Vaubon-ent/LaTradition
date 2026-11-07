import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../js/state.js';
import { DRAFT_KEY, saveDraft, loadDraft, clearDraft, restoreDraftIntoState } from '../js/draft.js';

beforeEach(() => {
  localStorage.clear();
});

describe('draft persistence (F7)', () => {
  it('round-trips pii and items through localStorage', () => {
    const state = {
      ...createInitialState(),
      step: 3,
      pii: { first_name: 'Jean', last_name: 'Dupont', phone: '0612345678' },
      items: { blanc: 1.5 },
    };
    saveDraft(state);
    const restored = restoreDraftIntoState(createInitialState());
    expect(restored.step).toBe(3);
    expect(restored.pii.first_name).toBe('Jean');
    expect(restored.items.blanc).toBe(1.5);
  });

  it('clearDraft removes the stored draft', () => {
    saveDraft({ ...createInitialState(), items: { blanc: 1 } });
    clearDraft();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(loadDraft()).toBeNull();
  });

  it('discards a corrupted draft instead of throwing', () => {
    localStorage.setItem(DRAFT_KEY, '{not valid json');
    expect(() => loadDraft()).not.toThrow();
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('restoreDraftIntoState returns the base state unchanged when no draft exists', () => {
    const base = createInitialState();
    expect(restoreDraftIntoState(base)).toEqual(base);
  });
});
