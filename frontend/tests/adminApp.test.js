import { describe, it, expect, vi, beforeEach } from 'vitest';

function setupDom() {
  document.body.innerHTML = `
    <div id="admin-app">
      <section id="view-loading" data-view="loading"></section>
      <section id="view-login" data-view="login" hidden>
        <form data-role="login-form">
          <input type="password" name="password" />
          <button type="submit">Se connecter</button>
        </form>
        <p data-role="login-error" hidden></p>
      </section>
      <section id="view-dashboard" data-view="dashboard" hidden>
        <button type="button" data-role="logout">Se déconnecter</button>
      </section>
    </div>
  `;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mockFetch({ sessionOk, loginStatus, loginBody } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url.includes('/api/admin/session')) {
      return sessionOk
        ? { ok: true, status: 200, json: async () => ({ ok: true }) }
        : { ok: false, status: 401, json: async () => ({ error: 'Jeton de session manquant.' }) };
    }
    if (url.includes('/api/admin/login')) {
      const status = loginStatus || 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => loginBody || { ok: true },
      };
    }
    if (url.includes('/api/admin/logout')) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    throw new Error(`URL non mockée : ${url}`);
  });
}

async function loadApp() {
  vi.resetModules();
  const mod = await import('../admin/js/adminApp.js');
  mod.start();
  await flush();
  await flush();
  return mod;
}

beforeEach(() => {
  setupDom();
});

describe('adminApp — détection de session au chargement', () => {
  it('bascule vers la vue login si la session est invalide', async () => {
    mockFetch({ sessionOk: false });
    await loadApp();

    expect(document.getElementById('view-login').hidden).toBe(false);
    expect(document.getElementById('view-dashboard').hidden).toBe(true);
  });

  it('bascule vers la vue dashboard si la session est valide', async () => {
    mockFetch({ sessionOk: true });
    await loadApp();

    expect(document.getElementById('view-dashboard').hidden).toBe(false);
    expect(document.getElementById('view-login').hidden).toBe(true);
  });
});

describe('adminApp — login', () => {
  it('mot de passe correct → vue dashboard', async () => {
    mockFetch({ sessionOk: false, loginStatus: 200 });
    await loadApp();

    const form = document.querySelector('[data-role="login-form"]');
    form.elements.password.value = 'bon-mot-de-passe';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(document.getElementById('view-dashboard').hidden).toBe(false);
  });

  it('mot de passe incorrect (401) → message d\'erreur, vue reste login', async () => {
    mockFetch({ sessionOk: false, loginStatus: 401, loginBody: { error: 'Mot de passe incorrect.' } });
    await loadApp();

    const form = document.querySelector('[data-role="login-form"]');
    form.elements.password.value = 'mauvais';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(document.getElementById('view-login').hidden).toBe(false);
    const errorEl = document.querySelector('[data-role="login-error"]');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Mot de passe incorrect.');
  });

  it('compte verrouillé (429) → message dédié', async () => {
    mockFetch({ sessionOk: false, loginStatus: 429, loginBody: { error: 'Trop de tentatives.' } });
    await loadApp();

    const form = document.querySelector('[data-role="login-form"]');
    form.elements.password.value = 'peu-importe';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const errorEl = document.querySelector('[data-role="login-error"]');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Trop de tentatives, réessayez plus tard.');
  });
});

describe('adminApp — logout', () => {
  it('retourne à la vue login', async () => {
    mockFetch({ sessionOk: true });
    await loadApp();

    document.querySelector('[data-role="logout"]').click();
    await flush();

    expect(document.getElementById('view-login').hidden).toBe(false);
    expect(document.getElementById('view-dashboard').hidden).toBe(true);
  });
});

describe('adminApp — expiration de session en cours d\'usage (401 global)', () => {
  it('un appel adminFetch recevant 401 bascule vers login avec un message dédié', async () => {
    mockFetch({ sessionOk: true });
    await loadApp();
    expect(document.getElementById('view-dashboard').hidden).toBe(false);

    const { adminFetch } = await import('../admin/js/adminApi.js');
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Jeton de session invalide ou expiré.' }),
    }));

    await expect(adminFetch('/api/admin/orders')).rejects.toBeTruthy();
    await flush();

    expect(document.getElementById('view-login').hidden).toBe(false);
    const errorEl = document.querySelector('[data-role="login-error"]');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Session expirée, reconnectez-vous.');
  });
});

describe('adminApp — convention de chemins absolus', () => {
  it("n'appelle jamais les endpoints admin en chemin relatif", async () => {
    mockFetch({ sessionOk: true });
    await loadApp();

    const calledUrls = global.fetch.mock.calls.map(([url]) => url);
    calledUrls.forEach((url) => {
      expect(url.startsWith('/api/admin/') || url.startsWith('http')).toBe(true);
      expect(url.startsWith('./')).toBe(false);
      expect(url.startsWith('../')).toBe(false);
    });
  });
});
