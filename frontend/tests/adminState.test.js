import { describe, it, expect } from 'vitest';
import { createInitialState, setView, setLoginError } from '../admin/js/adminState.js';

describe('adminState', () => {
  it("l'état initial est en vue loading sans erreur", () => {
    const state = createInitialState();
    expect(state.view).toBe('loading');
    expect(state.loginError).toBeNull();
  });

  it('setView change uniquement la vue', () => {
    const state = setView(createInitialState(), 'login');
    expect(state.view).toBe('login');
  });

  it('setLoginError change uniquement le message', () => {
    const state = setLoginError(createInitialState(), 'Mot de passe incorrect.');
    expect(state.loginError).toBe('Mot de passe incorrect.');
    expect(state.view).toBe('loading');
  });
});
