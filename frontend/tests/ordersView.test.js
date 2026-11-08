import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onUnauthorized } from '../admin/js/adminApi.js';
import { mount } from '../admin/js/ordersView.js';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeOrder(overrides = {}) {
  return {
    id: 1,
    season: '2026',
    status: 'recue',
    created_at: '2026-11-08 14:32:00',
    first_name: 'Jeanne',
    last_name: 'Dupont',
    phone: '0612345678',
    items: [{ product_id: 'noir', quantity_500g: 2 }],
    ...overrides,
  };
}

function mockFetch({ orders, statusResponses = [], exportResponse } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (options.method === 'PATCH' && url.includes('/status')) {
      const next = statusResponses.shift() || { status: 200, body: { ok: true } };
      return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
    }
    if (options.method === 'POST' && url.includes('/export/save')) {
      return exportResponse || { ok: true, status: 200, json: async () => ({ ok: true, path: 'data/exports/commandes-2026.xlsx' }) };
    }
    if (url.includes('/api/admin/orders')) {
      return { ok: true, status: 200, json: async () => ({ orders: orders || [] }) };
    }
    throw new Error(`URL non mockée : ${url}`);
  });
}

function getContainer() {
  document.body.innerHTML = '<div id="root"></div>';
  return document.getElementById('root');
}

beforeEach(() => {
  delete global.window?.API_BASE;
  onUnauthorized(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ordersView — montage initial', () => {
  it('rend une ligne par commande retournée par GET /api/admin/orders', async () => {
    mockFetch({ orders: [makeOrder()] });
    const root = getContainer();
    await mount(root);

    const rows = root.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Dupont');
    expect(rows[0].textContent).toContain('Jeanne');
  });
});

describe('ordersView — filtrage colonne', () => {
  it('taper dans un filtre masque les lignes non correspondantes sans nouvel appel réseau', async () => {
    mockFetch({ orders: [makeOrder({ id: 1, last_name: 'Dupont' }), makeOrder({ id: 2, last_name: 'Martin' })] });
    const root = getContainer();
    await mount(root);

    const callsBefore = global.fetch.mock.calls.length;
    const filterInput = root.querySelector('[data-filter="last_name"]');
    filterInput.value = 'dup';
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));

    const rows = root.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Dupont');
    expect(global.fetch.mock.calls.length).toBe(callsBefore);
  });
});

describe('ordersView — case Récupéré', () => {
  it('cocher Récupéré déclenche PATCH avec retiree et met à jour la ligne après succès', async () => {
    mockFetch({ orders: [makeOrder({ status: 'recue' })], statusResponses: [{ status: 200, body: { ok: true } }] });
    const root = getContainer();
    await mount(root);

    const checkbox = root.querySelector('[data-role="pickedup-checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const patchCall = global.fetch.mock.calls.find(([url, opts]) => opts?.method === 'PATCH');
    expect(patchCall[0]).toContain('/api/admin/orders/1/status');
    expect(JSON.parse(patchCall[1].body)).toEqual({ status: 'retiree' });

    const paidCheckbox = root.querySelector('[data-role="paid-checkbox"]');
    expect(paidCheckbox.checked).toBe(true);
    expect(paidCheckbox.disabled).toBe(true);
  });

  it('échec serveur → message d\'erreur affiché et case revenue à son état initial', async () => {
    mockFetch({ orders: [makeOrder({ status: 'recue' })], statusResponses: [{ status: 500, body: { error: 'Erreur serveur.' } }] });
    const root = getContainer();
    await mount(root);

    const checkbox = root.querySelector('[data-role="pickedup-checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(checkbox.checked).toBe(false);
    const errorEl = root.querySelector('[data-role="pickedup-error"]');
    expect(errorEl.hidden).toBe(false);
  });
});

describe('ordersView — export', () => {
  it('clic sur Exporter déclenche POST /api/admin/export/save et affiche le chemin retourné', async () => {
    mockFetch({ orders: [makeOrder()] });
    const root = getContainer();
    await mount(root);

    root.querySelector('[data-role="export-orders"]').click();
    await flush();

    const exportCall = global.fetch.mock.calls.find(([url, opts]) => opts?.method === 'POST' && url.includes('/export/save'));
    expect(exportCall).toBeTruthy();
    const messageEl = root.querySelector('[data-role="orders-message"]');
    expect(messageEl.hidden).toBe(false);
    expect(messageEl.textContent).toContain('data/exports/commandes-2026.xlsx');
  });
});

describe('ordersView — boutons stub', () => {
  it('Clôturer la campagne affiche le message stub sans appel réseau supplémentaire', async () => {
    mockFetch({ orders: [makeOrder()] });
    const root = getContainer();
    await mount(root);

    const callsBefore = global.fetch.mock.calls.length;
    root.querySelector('[data-role="close-campaign"]').click();

    expect(global.fetch.mock.calls.length).toBe(callsBefore);
    const messageEl = root.querySelector('[data-role="orders-message"]');
    expect(messageEl.hidden).toBe(false);
    expect(messageEl.textContent).toContain('pas encore implémenté');
  });

  it('Nouvelle campagne affiche le message stub sans appel réseau supplémentaire', async () => {
    mockFetch({ orders: [makeOrder()] });
    const root = getContainer();
    await mount(root);

    const callsBefore = global.fetch.mock.calls.length;
    root.querySelector('[data-role="new-campaign"]').click();

    expect(global.fetch.mock.calls.length).toBe(callsBefore);
    const messageEl = root.querySelector('[data-role="orders-message"]');
    expect(messageEl.hidden).toBe(false);
    expect(messageEl.textContent).toContain('pas encore implémenté');
  });
});
