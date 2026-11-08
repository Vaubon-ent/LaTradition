import { describe, it, expect } from 'vitest';
import { init, render, formatDateLong } from '../js/steps/confirmation.js';
import { createInitialState, setOrderResult, setPublicSettings } from '../js/state.js';

describe('formatDateLong', () => {
  it('formats a calendar date in long French form, immune to local timezone', () => {
    expect(formatDateLong('2026-12-13')).toBe('13 décembre 2026');
  });
});

describe('confirmation — informations pratiques', () => {
  it("affiche l'adresse de retrait, l'heure de retrait et le contact quand ils sont configurés", () => {
    const container = document.createElement('div');
    init(container);
    let state = setOrderResult(createInitialState(), { total_cents: 1000, conception_date: '2026-12-13' });
    state = setPublicSettings(state, {
      conceptionDate: '2026-12-13',
      orderDeadline: '2026-12-06',
      locked: false,
      nonce: 'n',
      news: '',
      pickup_address: '12 rue de la Tradition, 12345 Boudinville',
      pickup_time: 'à partir de 16h',
      contact_phone: '06 11 22 33 44',
    });

    render(container, state);

    expect(container.querySelector('[data-role="address"]').hidden).toBe(false);
    expect(container.querySelector('[data-role="address"]').textContent).toContain('12 rue de la Tradition');
    expect(container.querySelector('[data-role="pickup-time"]').hidden).toBe(false);
    expect(container.querySelector('[data-role="pickup-time"]').textContent).toContain('à partir de 16h');
    expect(container.querySelector('[data-role="contact"]').hidden).toBe(false);
    expect(container.querySelector('[data-role="contact"]').textContent).toContain('06 11 22 33 44');
  });

  it('masque adresse, heure de retrait et contact quand ils ne sont pas configurés', () => {
    const container = document.createElement('div');
    init(container);
    const state = setOrderResult(createInitialState(), { total_cents: 1000, conception_date: '2026-12-13' });

    render(container, state);

    expect(container.querySelector('[data-role="address"]').hidden).toBe(true);
    expect(container.querySelector('[data-role="pickup-time"]').hidden).toBe(true);
    expect(container.querySelector('[data-role="contact"]').hidden).toBe(true);
  });
});
