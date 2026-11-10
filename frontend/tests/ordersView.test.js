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
    total_cents: 1000,
    paid_status: 'en_attente',
    picked_up: 0,
    items: [{ product_id: 'noir', quantity_500g: 2 }],
    ...overrides,
  };
}

function mockFetch({ orders, statusResponses = [], exportResponse } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (options.method === 'PATCH') {
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

  it('affiche le montant de la commande dans une colonne dédiée', async () => {
    mockFetch({ orders: [makeOrder({ total_cents: 4250 })] });
    const root = getContainer();
    await mount(root);

    const rows = root.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('42,50');
  });
});

describe('ordersView — totaux', () => {
  it('affiche nombre de commandes, montant total et kg par produit (+ global) sur les commandes visibles', async () => {
    mockFetch({
      orders: [
        makeOrder({ id: 1, last_name: 'Dupont', total_cents: 1000, items: [{ product_id: 'noir', quantity_500g: 2 }] }),
        makeOrder({ id: 2, last_name: 'Martin', total_cents: 2500, items: [{ product_id: 'blanc', quantity_500g: 1 }] }),
      ],
    });
    const root = getContainer();
    await mount(root);

    const summary = root.querySelector('[data-role="orders-summary"]');
    expect(summary.textContent).toContain('2');
    expect(summary.textContent).toContain('35,00');
    expect(summary.textContent).toContain('1');
    expect(summary.textContent).toContain('0,5');
  });

  it('les totaux se recalculent sur les commandes filtrées (pas toute la saison)', async () => {
    mockFetch({
      orders: [
        makeOrder({ id: 1, last_name: 'Dupont', total_cents: 1000 }),
        makeOrder({ id: 2, last_name: 'Martin', total_cents: 2500 }),
      ],
    });
    const root = getContainer();
    await mount(root);

    const filterInput = root.querySelector('[data-filter="last_name"]');
    filterInput.value = 'dup';
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));

    const summary = root.querySelector('[data-role="orders-summary"]');
    expect(summary.textContent).toContain('10,00');
    expect(summary.textContent).not.toContain('35,00');
  });
});

describe('ordersView — colonne Option (demande directe du 2026-11-10)', () => {
  it('affiche le libellé de l\'option de chaque commande', async () => {
    mockFetch({
      orders: [
        makeOrder({ id: 1, last_name: 'Dupont', option: 'plus_piment' }),
        makeOrder({ id: 2, last_name: 'Martin', option: '' }),
      ],
    });
    const root = getContainer();
    await mount(root);

    const rows = root.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Plus de piment');
  });

  it('le filtre Option masque les lignes qui ne correspondent pas, sans nouvel appel réseau', async () => {
    mockFetch({
      orders: [
        makeOrder({ id: 1, last_name: 'Dupont', option: 'plus_piment' }),
        makeOrder({ id: 2, last_name: 'Martin', option: '' }),
      ],
    });
    const root = getContainer();
    await mount(root);

    const callsBefore = global.fetch.mock.calls.length;
    const filterSelect = root.querySelector('[data-filter="option"]');
    filterSelect.value = 'plus_piment';
    filterSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const rows = root.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Dupont');
    expect(global.fetch.mock.calls.length).toBe(callsBefore);
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

describe('ordersView — Payé / Récupéré découplés (demande directe du 2026-11-10)', () => {
  it('changer Récupéré déclenche PATCH /payment avec picked_up, sans toucher paid_status', async () => {
    mockFetch({
      orders: [makeOrder({ paid_status: 'non', picked_up: 0 })],
      statusResponses: [{ status: 200, body: { ok: true } }],
    });
    const root = getContainer();
    await mount(root);

    const select = root.querySelector('[data-role="pickedup-select"]');
    select.value = 'oui';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const patchCall = global.fetch.mock.calls.find(([url, opts]) => opts?.method === 'PATCH');
    expect(patchCall[0]).toContain('/api/admin/orders/1/payment');
    expect(JSON.parse(patchCall[1].body)).toEqual({ picked_up: true });

    // Récupérée mais pas payée : les deux champs restent bien indépendants.
    const paidSelect = root.querySelector('[data-role="paid-select"]');
    expect(paidSelect.value).toBe('non');
    expect(paidSelect.disabled).toBe(false);
  });

  it('changer Payé (3 états) déclenche PATCH /payment avec paid_status, sans toucher picked_up', async () => {
    mockFetch({
      orders: [makeOrder({ paid_status: 'en_attente', picked_up: 0 })],
      statusResponses: [{ status: 200, body: { ok: true } }],
    });
    const root = getContainer();
    await mount(root);

    const select = root.querySelector('[data-role="paid-select"]');
    select.value = 'oui';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const patchCall = global.fetch.mock.calls.find(([url, opts]) => opts?.method === 'PATCH');
    expect(patchCall[0]).toContain('/api/admin/orders/1/payment');
    expect(JSON.parse(patchCall[1].body)).toEqual({ paid_status: 'oui' });

    const pickedUpSelect = root.querySelector('[data-role="pickedup-select"]');
    expect(pickedUpSelect.value).toBe('non');
  });

  it('échec serveur sur Récupéré → message d\'erreur affiché et liste déroulante revenue à son état initial', async () => {
    mockFetch({
      orders: [makeOrder({ paid_status: 'non', picked_up: 0 })],
      statusResponses: [{ status: 500, body: { error: 'Erreur serveur.' } }],
    });
    const root = getContainer();
    await mount(root);

    const select = root.querySelector('[data-role="pickedup-select"]');
    select.value = 'oui';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(select.value).toBe('non');
    const errorEl = root.querySelector('[data-role="pickedup-error"]');
    expect(errorEl.hidden).toBe(false);
  });

  it('échec serveur sur Payé → message d\'erreur affiché et liste déroulante revenue à son état initial', async () => {
    mockFetch({
      orders: [makeOrder({ paid_status: 'en_attente', picked_up: 0 })],
      statusResponses: [{ status: 500, body: { error: 'Erreur serveur.' } }],
    });
    const root = getContainer();
    await mount(root);

    const select = root.querySelector('[data-role="paid-select"]');
    select.value = 'oui';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(select.value).toBe('en_attente');
    const errorEl = root.querySelector('[data-role="paid-error"]');
    expect(errorEl.hidden).toBe(false);
  });
});

describe('ordersView — tri par en-tête', () => {
  it('clic sur l\'en-tête Nom trie croissant, un 2e clic inverse, sans nouvel appel réseau', async () => {
    mockFetch({
      orders: [
        makeOrder({ id: 1, last_name: 'Martin' }),
        makeOrder({ id: 2, last_name: 'Dupont' }),
        makeOrder({ id: 3, last_name: 'Bernard' }),
      ],
    });
    const root = getContainer();
    await mount(root);
    const callsBefore = global.fetch.mock.calls.length;

    const header = root.querySelector('[data-sort-key="last_name"]');
    header.click();
    let rows = root.querySelectorAll('tbody tr');
    expect(Array.from(rows).map((r) => r.textContent)).toEqual([
      expect.stringContaining('Bernard'),
      expect.stringContaining('Dupont'),
      expect.stringContaining('Martin'),
    ]);
    expect(root.querySelector('[data-sort-indicator="last_name"]').textContent).toContain('▲');

    header.click();
    rows = root.querySelectorAll('tbody tr');
    expect(Array.from(rows).map((r) => r.textContent)).toEqual([
      expect.stringContaining('Martin'),
      expect.stringContaining('Dupont'),
      expect.stringContaining('Bernard'),
    ]);
    expect(root.querySelector('[data-sort-indicator="last_name"]').textContent).toContain('▼');

    expect(global.fetch.mock.calls.length).toBe(callsBefore);
  });

  it('le tri reste appliqué après un filtrage', async () => {
    mockFetch({
      orders: [
        makeOrder({ id: 1, last_name: 'Martin' }),
        makeOrder({ id: 2, last_name: 'Dupont' }),
        makeOrder({ id: 3, last_name: 'Bernard' }),
      ],
    });
    const root = getContainer();
    await mount(root);

    root.querySelector('[data-sort-key="last_name"]').click();
    const filterInput = root.querySelector('[data-filter="last_name"]');
    filterInput.value = 'a';
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));

    const rows = root.querySelectorAll('tbody tr');
    expect(Array.from(rows).map((r) => r.textContent)).toEqual([
      expect.stringContaining('Bernard'),
      expect.stringContaining('Martin'),
    ]);
  });
});

describe('ordersView — édition commande (colonne Actions)', () => {
  it('clic sur Modifier ouvre la modale pré-remplie avec les données de la bonne commande', async () => {
    mockFetch({ orders: [makeOrder({ id: 1, last_name: 'Dupont' }), makeOrder({ id: 2, last_name: 'Martin' })] });
    const root = getContainer();
    await mount(root);

    root.querySelector('[data-order-id="2"][data-role="edit-order"]').click();

    const dialog = root.querySelector('.order-edit-dialog');
    expect(dialog.querySelector('[name="last_name"]').value).toBe('Martin');
  });

  it('après un enregistrement réussi, la liste est rechargée (nouveau GET /api/admin/orders)', async () => {
    mockFetch({ orders: [makeOrder({ id: 1, last_name: 'Dupont' })] });
    const root = getContainer();
    await mount(root);
    const callsBefore = global.fetch.mock.calls.length;

    root.querySelector('[data-role="edit-order"]').click();
    const dialog = root.querySelector('.order-edit-dialog');
    const form = dialog.querySelector('[data-role="order-edit-form"]');
    global.fetch = vi.fn(async (url, options = {}) => {
      if (options.method === 'PUT') {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      if (url.includes('/api/admin/orders')) {
        return { ok: true, status: 200, json: async () => ({ orders: [makeOrder({ id: 1, last_name: 'Dupont-Martin' })] }) };
      }
      throw new Error(`URL non mockée : ${url}`);
    });
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();

    expect(global.fetch.mock.calls.some(([, opts]) => opts?.method === 'PUT')).toBe(true);
    expect(global.fetch.mock.calls.some(([url, opts]) => !opts?.method && url.includes('/api/admin/orders'))).toBe(true);
    const rows = root.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Dupont-Martin');
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
