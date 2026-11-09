import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      <button type="button" id="restart" hidden>Recommencer</button>
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

function mockFetchDefault({ checkPhoneResult, checkPhoneFails, orderResult, orderFails, products } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url.includes('/api/settings/public')) {
      return { ok: true, json: async () => SETTINGS_RESPONSE };
    }
    if (url.includes('/api/products')) {
      return { ok: true, json: async () => (products ? { products } : PRODUCTS_RESPONSE) };
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

  it('affiche la roulette de valeurs au clic/focus dans le champ', async () => {
    mockFetchDefault();
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();

    const qtyInput = document.querySelector('#step-2 [data-role="qty"]');
    const wheel = document.querySelector('#step-2 [data-role="wheel"]');
    expect(wheel.hidden).toBe(true);

    qtyInput.focus();
    expect(wheel.hidden).toBe(false);
    expect(wheel.querySelectorAll('li').length).toBeGreaterThan(0);
  });

  it('un clic sur une valeur de la roulette met à jour la quantité et referme la roulette', async () => {
    mockFetchDefault();
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();

    const qtyInput = document.querySelector('#step-2 [data-role="qty"]');
    const wheel = document.querySelector('#step-2 [data-role="wheel"]');
    qtyInput.focus();

    const target = wheel.querySelector('li[data-value="2"]');
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(qtyInput.value).toBe('2');
    expect(wheel.hidden).toBe(true);
  });

  it('referme la roulette sur un clic en dehors du champ', async () => {
    mockFetchDefault();
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();

    const qtyInput = document.querySelector('#step-2 [data-role="qty"]');
    const wheel = document.querySelector('#step-2 [data-role="wheel"]');
    qtyInput.focus();
    expect(wheel.hidden).toBe(false);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(wheel.hidden).toBe(true);
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
    const warningEl = document.querySelector('#step-3 [data-role="duplicate-warning"]');
    expect(warningEl.hidden).toBe(false);
    // Retour utilisateur du 2026-11-09 : la modification d'une commande déjà
    // confirmée reste réservée à l'admin, jamais une resoumission publique —
    // le message doit orienter vers un contact plutôt que suggérer de
    // réessayer avec le même numéro.
    expect(warningEl.textContent).toContain('contactez-nous');
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

  it('conserve la saisie et le brouillon si la soumission échoue, et redirige vers l\'admin pour un doublon (409)', async () => {
    mockFetchDefault({ orderFails: true });
    await loadApp();
    await fillUpToRecap();

    document.querySelector('#step-4 [data-role="submit"]').click();
    await flush();
    await flush();

    expect(document.getElementById('step-4').hidden).toBe(false);
    const errorEl = document.querySelector('#step-4 [data-role="error"]');
    expect(errorEl.hidden).toBe(false);
    // Retour utilisateur du 2026-11-09 : sur un 409 (doublon téléphone), le
    // message doit orienter vers l'admin plutôt que montrer l'erreur serveur
    // brute ("Commande déjà existante.") — pas de resoumission publique.
    expect(errorEl.textContent).toContain('Contactez-nous');
    expect(errorEl.textContent).not.toContain('Commande déjà existante');
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    expect(draft.pii.first_name).toBe('Jean');
    expect(draft.items.blanc).toBe(1);
  });
});

describe('carte Récapitulatif — estimation façon ticket de caisse (M-FR2)', () => {
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

  it("n'affiche plus jamais le prix au kg, affiche une estimation par ligne et un total cohérent", async () => {
    mockFetchDefault();
    await loadApp();
    await fillUpToRecap();

    const recap = document.getElementById('step-4');
    expect(recap.textContent).not.toContain('€/kg');

    // blanc à 1000 c/kg (10,00 €/kg), 1 kg commandé (goToPii incrémente une
    // fois) -> estimation de ligne = 1000c/500g x 2 = 1000c = 10,00 €.
    const line = recap.querySelector('[data-role="lines"] .receipt-line');
    expect(line.querySelector('.amount').textContent).toContain('10,00');

    const totalLine = recap.querySelector('[data-role="total-line"]');
    expect(totalLine.textContent).toContain('Estimation');
    expect(totalLine.textContent).not.toMatch(/^Total/);
    expect(recap.querySelector('[data-role="total"]').textContent).toContain('10,00');

    expect(recap.querySelector('[data-role="note"]').textContent).toContain('définitif');
  });
});

describe('bouton Recommencer (M-FR5)', () => {
  async function reachConfirmation() {
    await goToPii();
    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');
    document.querySelector('#step-3 [data-role="next"]').click();
    await flush();
    await flush();
    document.querySelector('#step-4 [data-role="submit"]').click();
    await flush();
    await flush();
  }

  it("reste masqué aux étapes 1 à 4 (le bouton Précédent de chaque étape couvre déjà le retour en arrière)", async () => {
    mockFetchDefault();
    await loadApp();
    expect(document.getElementById('restart').hidden).toBe(true);

    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();
    expect(document.getElementById('restart').hidden).toBe(true);

    document.querySelector('#step-2 [data-role="inc"]').click();
    await flush();
    document.querySelector('#step-2 [data-role="next"]').click();
    await flush();
    expect(document.getElementById('restart').hidden).toBe(true);

    document.querySelector('#step-3 [data-role="form"]').elements.first_name.value;
    expect(document.getElementById('restart').hidden).toBe(true);
  });

  it("devient visible à l'étape 5 (Confirmation) et n'efface rien si la confirmation est annulée", async () => {
    mockFetchDefault();
    await loadApp();
    await reachConfirmation();

    expect(document.getElementById('step-5').hidden).toBe(false);
    expect(document.getElementById('restart').hidden).toBe(false);

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    document.getElementById('restart').click();
    await flush();

    expect(document.getElementById('step-5').hidden).toBe(false);
  });

  it('réinitialise état, étape et brouillon quand la confirmation est acceptée, et recommence à sauvegarder ensuite', async () => {
    mockFetchDefault();
    await loadApp();
    await reachConfirmation();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.getElementById('restart').click();

    // Le brouillon est vidé de façon synchrone par restart() lui-même, avant
    // même que le nouvel appel enter() de l'étape Bienvenue ne se résolve.
    expect(document.getElementById('step-1').hidden).toBe(false);
    expect(document.getElementById('restart').hidden).toBe(true);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    await flush();
    await flush();

    // Une saisie faite après Recommencer doit à nouveau être sauvegardée en
    // brouillon (contrairement au cas confirmation, où draftSuppressed reste figé).
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();
    document.querySelector('#step-2 [data-role="inc"]').click();
    await flush();
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it("ne laisse pas de saisie PII fantôme dans le DOM après Recommencer (bug signalé le 2026-11-09)", async () => {
    mockFetchDefault();
    await loadApp();
    await reachConfirmation();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.getElementById('restart').click();
    await flush();
    await flush();

    // On revient sur l'étape Coordonnées : le DOM doit refléter l'état vidé,
    // pas l'ancienne saisie ("Jean"/"Dupont"/le téléphone précédent).
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();
    document.querySelector('#step-2 [data-role="inc"]').click();
    await flush();
    document.querySelector('#step-2 [data-role="next"]').click();
    await flush();

    const form = document.querySelector('#step-3 [data-role="form"]');
    expect(form.elements.first_name.value).toBe('');
    expect(form.elements.last_name.value).toBe('');
    expect(form.elements.phone.value).toBe('');

    // Et la validation doit se comporter en conséquence : Suivant doit
    // réclamer les champs, pas bloquer silencieusement sur un état fantôme.
    document.querySelector('#step-3 [data-role="next"]').click();
    await flush();
    expect(document.querySelector('#step-3 [data-role="validation-error"]').hidden).toBe(false);
  });
});

describe('responsive stepper/roulette — règles CSS présentes (M-FR3)', () => {
  it('masque la roulette en pc/tablette et le stepper +/- en mobile, via media queries pures', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(testDir, '..', 'css', 'styles.css'), 'utf8');

    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.qty-wheel\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*767\.98px\)\s*\{[\s\S]*?\.stepper button\[data-role="dec"\][\s\S]*?\.stepper button\[data-role="inc"\][\s\S]*?display:\s*none/
    );
  });

  it("masque les flèches natives du champ de quantité, pc/tablette comme mobile (retour utilisateur du 2026-11-09)", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(testDir, '..', 'css', 'styles.css'), 'utf8');

    expect(css).toMatch(/-moz-appearance:\s*textfield/);
    expect(css).toMatch(
      /::-webkit-outer-spin-button[\s\S]*?::-webkit-inner-spin-button[\s\S]*?\{[\s\S]*?-webkit-appearance:\s*none/
    );
  });
});

describe('étape Commande — une seule roulette ouverte à la fois (M-FR3)', () => {
  it('ferme la roulette du premier produit quand on ouvre celle du second', async () => {
    mockFetchDefault({
      products: [
        { id: 'blanc', name: 'Boudin blanc', price_per_kg: 1000 },
        { id: 'noir', name: 'Boudin noir', price_per_kg: 1000 },
      ],
    });
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();

    const cards = document.querySelectorAll('#step-2 .product-card');
    const qtyA = cards[0].querySelector('[data-role="qty"]');
    const wheelA = cards[0].querySelector('[data-role="wheel"]');
    const qtyB = cards[1].querySelector('[data-role="qty"]');
    const wheelB = cards[1].querySelector('[data-role="wheel"]');

    qtyA.focus();
    expect(wheelA.hidden).toBe(false);

    qtyB.focus();
    expect(wheelB.hidden).toBe(false);
    expect(wheelA.hidden).toBe(true);
  });
});

describe('étape Coordonnées — correctifs audit UX P1/P2 (M-FR4)', () => {
  it('#1 : le message de validation se masque dès que la saisie redevient valide, sans clic sur Suivant', async () => {
    mockFetchDefault();
    await loadApp();
    document.querySelector('#step-1 [data-role="start"]').click();
    await flush();
    await flush();
    document.querySelector('#step-2 [data-role="inc"]').click();
    await flush();
    document.querySelector('#step-2 [data-role="next"]').click();
    await flush();

    document.querySelector('#step-3 [data-role="next"]').click();
    await flush();
    const errorEl = document.querySelector('#step-3 [data-role="validation-error"]');
    expect(errorEl.hidden).toBe(false);

    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');

    expect(errorEl.hidden).toBe(true);
  });

  it("#7 : valider le formulaire par la touche Entrée (submit) déclenche la même action que Suivant", async () => {
    mockFetchDefault();
    await loadApp();
    await goToPii();

    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();

    expect(document.getElementById('step-4').hidden).toBe(false);
  });

  it('#5 : le bouton Suivant est désactivé pendant la vérification puis réactivé (succès et échec)', async () => {
    mockFetchDefault();
    await loadApp();
    await goToPii();

    const form = document.querySelector('#step-3 [data-role="form"]');
    fireInput(form.elements.first_name, 'Jean');
    fireInput(form.elements.last_name, 'Dupont');
    fireInput(form.elements.phone, '0612345678');

    const nextButton = document.querySelector('#step-3 [data-role="next"]');
    const clickPromise = (async () => {
      nextButton.click();
    })();
    await Promise.resolve();
    expect(nextButton.disabled).toBe(true);

    await clickPromise;
    await flush();
    await flush();
    expect(nextButton.disabled).toBe(false);
  });
});
