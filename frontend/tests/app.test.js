import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DRAFT_KEY } from '../js/draft.js';

function setupDom() {
  document.body.innerHTML = `
    <div id="app">
      <header><p id="progress"></p></header>
      <main>
        <section id="step-1" class="step"></section>
        <section id="step-2" class="step"></section>
        <section id="step-3" class="step"></section>
        <section id="step-4" class="step"></section>
        <section id="step-5" class="step"></section>
      </main>
    </div>
  `;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fireInput(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function fireChange(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const SETTINGS_RESPONSE = {
  conceptionDate: '2026-12-13',
  orderDeadline: '2026-12-06',
  locked: false,
  nonce: 'nonce-1',
  news: '',
};
const PRODUCTS_RESPONSE = { products: [{ id: 'blanc', name: 'Boudin blanc', price_per_kg: 1000 }] };

function mockFetchDefault({ checkPhoneResult, checkPhoneFails, orderResult, orderFails } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url.includes('/api/settings/public')) {
      return { ok: true, json: async () => SETTINGS_RESPONSE };
    }
    if (url.includes('/api/products')) {
      return { ok: true, json: async () => PRODUCTS_RESPONSE };
    }
    if (url.includes('/api/check-phone')) {
      if (checkPhoneFails) {
        return { ok: false, status: 500, json: async () => ({ error: 'panne' }) };
      }
      return { ok: true, json: async () => ({ duplicate: Boolean(checkPhoneResult) }) };
    }
    if (url.includes('/api/orders')) {
      if (orderFails) {
        return { ok: false, status: 409, json: async () => ({ error: 'Commande déjà existante.' }) };
      }
      return { ok: true, json: async () => orderResult || { total_cents: 1000, conception_date: '2026-12-13' } };
    }
    throw new Error(`URL non mockée : ${url}`);
  });
}

async function loadApp() {
  vi.resetModules();
  const mod = await import('../js/app.js');
  mod.start();
  await flush();
  await flush();
  return mod;
}

async function goToPii() {
  document.querySelector('#step-1 [data-role="start"]').click();
  await flush();
  await flush();
  document.querySelector('#step-2 [data-role="inc"]').click();
  await flush();
  document.querySelector('#step-2 [data-role="next"]').click();
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  setupDom();
});

describe('parcours client — navigation (F1)', () => {
  it('conserve les valeurs PII déjà saisies en naviguant avant/arrière', async () => {
    mockFetchDefault();
    await loadApp();
    await goToPii();

    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');

    document.querySelector('#step-3 [data-role="prev"]').click();
    await flush();
    expect(document.getElementById('step-2').hidden).toBe(false);

    document.querySelector('#step-2 [data-role="next"]').click();
    await flush();

    expect(document.querySelector('#step-3 [data-role="form"]').elements.first_name.value).toBe('Jean');
  });
});

describe('étape Commande — quantités (F3)', () => {
  it('incrémente par pas de 1 kg avec les boutons +/-', async () => {
    mockFetchDefault();
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();

    const qtyInput = document.querySelector('#step-2 [data-role="qty"]');
    document.querySelector('#step-2 [data-role="inc"]').click();
    await flush();
    expect(qtyInput.value).toBe('1');
  });

  it("permet de saisir directement une quantité pour commander par 500g", async () => {
    mockFetchDefault();
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();

    const qtyInput = document.querySelector('#step-2 [data-role="qty"]');
    fireChange(qtyInput, '1.5');
    await flush();
    expect(qtyInput.value).toBe('1.5');
    expect(document.querySelector('#step-2 [data-role="next"]').disabled).toBe(false);
  });

  it('arrondit une saisie libre au pas de 0,5 kg le plus proche', async () => {
    mockFetchDefault();
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();

    const qtyInput = document.querySelector('#step-2 [data-role="qty"]');
    fireChange(qtyInput, '0.3');
    await flush();
    expect(qtyInput.value).toBe('0.5');
  });
});

describe('étape PII — check-phone (F4)', () => {
  it('affiche un avertissement non bloquant si le téléphone est en doublon', async () => {
    mockFetchDefault({ checkPhoneResult: true });
    await loadApp();
    await goToPii();

    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');
    document.querySelector('#step-3 [data-role="next"]').click();
    await flush();
    await flush();

    expect(document.getElementById('step-4').hidden).toBe(false);
    expect(document.querySelector('#step-3 [data-role="duplicate-warning"]').hidden).toBe(false);
  });

  it("ne bloque jamais la navigation si l'appel check-phone échoue", async () => {
    mockFetchDefault({ checkPhoneFails: true });
    await loadApp();
    await goToPii();

    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');
    document.querySelector('#step-3 [data-role="next"]').click();
    await flush();
    await flush();

    expect(document.getElementById('step-4').hidden).toBe(false);
  });
});

describe('soumission de commande et brouillon (F5/F6/F7)', () => {
  async function fillUpToRecap() {
    await goToPii();
    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');
    document.querySelector('#step-3 [data-role="next"]').click();
    await flush();
    await flush();
  }

  it('affiche le total renvoyé par le serveur et vide le brouillon après confirmation', async () => {
    mockFetchDefault({ orderResult: { total_cents: 1500, conception_date: '2026-12-13' } });
    await loadApp();
    await fillUpToRecap();

    document.querySelector('#step-4 [data-role="submit"]').click();
    await flush();
    await flush();

    expect(document.getElementById('step-5').hidden).toBe(false);
    expect(document.querySelector('#step-5 [data-role="total"]').textContent).toContain('15,00');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('conserve la saisie et le brouillon si la soumission échoue', async () => {
    mockFetchDefault({ orderFails: true });
    await loadApp();
    await fillUpToRecap();

    document.querySelector('#step-4 [data-role="submit"]').click();
    await flush();
    await flush();

    expect(document.getElementById('step-4').hidden).toBe(false);
    expect(document.querySelector('#step-4 [data-role="error"]').hidden).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    expect(draft.pii.first_name).toBe('Jean');
    expect(draft.items.blanc).toBe(1);
  });
});
