import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onUnauthorized } from '../admin/js/adminApi.js';
import { mount } from '../admin/js/orderEditModal.js';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeOrder(overrides = {}) {
  return {
    id: 1,
    last_name: 'Dupont',
    first_name: 'Jeanne',
    phone: '0612345678',
    items: [{ product_id: 'noir', quantity_500g: 3 }],
    ...overrides,
  };
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

describe('orderEditModal — ouverture', () => {
  it('pré-remplit les champs PII et les quantités (en kg) de la commande ouverte', () => {
    const root = getContainer();
    const modal = mount(root, {});
    modal.open(makeOrder());

    const dialog = root.querySelector('.order-edit-dialog');
    expect(dialog.querySelector('[name="last_name"]').value).toBe('Dupont');
    expect(dialog.querySelector('[name="first_name"]').value).toBe('Jeanne');
    expect(dialog.querySelector('[name="phone"]').value).toBe('0612345678');
    expect(dialog.querySelector('[name="qty_noir"]').value).toBe('1.5');
    expect(dialog.querySelector('[name="qty_blanc"]').value).toBe('');
  });
});

describe('orderEditModal — enregistrement', () => {
  it('soumet un PUT avec le payload attendu et appelle onSaved en cas de succès', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    const onSaved = vi.fn();
    const root = getContainer();
    const modal = mount(root, { onSaved });
    modal.open(makeOrder());

    const dialog = root.querySelector('.order-edit-dialog');
    dialog.querySelector('[name="qty_noir"]').value = '2';
    dialog.querySelector('[name="qty_blanc"]').value = '1';
    dialog.querySelector('[data-role="order-edit-form"]').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/admin/orders/1');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({
      last_name: 'Dupont',
      first_name: 'Jeanne',
      phone: '0612345678',
      items: [
        { product_id: 'noir', quantity_500g: 4 },
        { product_id: 'blanc', quantity_500g: 2 },
      ],
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('affiche le message d\'erreur serveur et laisse la modale ouverte en cas d\'échec (ex. 409)', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Ce numéro de téléphone est déjà utilisé par un autre client.' }),
    }));
    const onSaved = vi.fn();
    const root = getContainer();
    const modal = mount(root, { onSaved });
    modal.open(makeOrder());

    const dialog = root.querySelector('.order-edit-dialog');
    dialog.querySelector('[data-role="order-edit-form"]').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();

    const errorEl = dialog.querySelector('[data-role="order-edit-error"]');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toContain('déjà utilisé');
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('orderEditModal — annulation', () => {
  it('le bouton Annuler ferme la modale sans appel réseau', () => {
    global.fetch = vi.fn();
    const root = getContainer();
    const modal = mount(root, {});
    modal.open(makeOrder());

    root.querySelector('[data-role="order-edit-cancel"]').click();

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
