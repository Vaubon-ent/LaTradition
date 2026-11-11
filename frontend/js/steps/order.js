import { fetchPublicSettings, fetchProducts } from '../api.js';
import {
  incrementProductQuantity,
  decrementProductQuantity,
  setProductQuantity,
  hasAnyQuantity,
  setProducts,
  setOption,
  setPublicSettings,
  roundToStep,
  QUANTITY_STEP_KG,
  formatKgLabel,
} from '../state.js';

// Incrément par défaut des boutons +/- : 1 kg (l'unité la plus courante).
// Le champ central reste un input libre pour les clients qui veulent
// commander par 500g (pas de 0,5 kg, jamais 100g — state.roundToStep).
const BUTTON_STEP_KG = 1;

// Plage affichée dans la roulette de sélection (au-delà, la saisie directe au
// clavier dans le champ reste toujours possible — jamais désactivée).
const WHEEL_MAX_KG = 20;

// Ordre d'affichage demandé explicitement par l'utilisateur le 2026-11-10
// (distinct de l'ordre renvoyé par GET /api/products, trié par id — purement
// un choix d'affichage front, aucun changement côté back). Un produit absent
// de cette liste serait affiché après, dans l'ordre reçu de l'API.
const DISPLAY_ORDER = ['noir', 'blanc', 'blanc_morue'];

function sortProductsForDisplay(products) {
  return [...products].sort((a, b) => {
    const indexA = DISPLAY_ORDER.indexOf(a.id);
    const indexB = DISPLAY_ORDER.indexOf(b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

// Préférence libre par commande (demande directe du 2026-11-10), affichée
// sous la dernière carte produit — un seul champ pour toute la commande.
const ORDER_OPTIONS = [
  { value: '', label: '' },
  { value: 'plus_piment', label: 'Plus de piment' },
  { value: 'moins_piment', label: 'Pas de piment' },
];

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function formatEuros(cents) {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildWheelValues() {
  const values = [];
  for (let v = 0; v <= WHEEL_MAX_KG; v += QUANTITY_STEP_KG) {
    values.push(Math.round(v * 1000) / 1000);
  }
  return values;
}

// Met en évidence la valeur centrée dans la roulette et y fait défiler —
// purement visuel. Seul un clic sur une valeur ou une saisie directe dans le
// champ (déjà géré par le listener "change" existant) modifie la quantité.
function syncWheel(wheelEl, qty) {
  const target = Math.max(0, Math.min(WHEEL_MAX_KG, roundToStep(qty)));
  for (const li of wheelEl.children) {
    const match = Number(li.dataset.value) === target;
    li.classList.toggle('selected', match);
    if (match) {
      wheelEl.scrollTop = li.offsetTop - wheelEl.clientHeight / 2 + li.offsetHeight / 2;
    }
  }
}

function init(container, ctx) {
  container.innerHTML = `
    <h2>Votre commande</h2>
    <div data-role="products"></div>
    <div class="order-option">
      <label for="order-option-select">Option</label>
      <select id="order-option-select" data-role="option">
        ${ORDER_OPTIONS.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('')}
      </select>
    </div>
    <p data-role="error" class="error" hidden></p>
    <div class="nav">
      <button type="button" data-role="prev">Précédent</button>
      <button type="button" data-role="next" class="primary" disabled>Suivant</button>
    </div>
  `;
  container.querySelector('[data-role="prev"]').addEventListener('click', () => ctx.goPrev());
  container.querySelector('[data-role="next"]').addEventListener('click', () => ctx.goNext());
  container.querySelector('[data-role="option"]').addEventListener('change', (event) => {
    ctx.update((s) => setOption(s, event.target.value));
  });
}

// Appelé par app.js chaque fois qu'on arrive sur cette étape (.ai/decisions.md :
// le nonce est récupéré ici, pas à l'étape Bienvenue, pour limiter le risque
// d'expiration sur un parcours potentiellement long).
async function enter(container, ctx) {
  const errorEl = container.querySelector('[data-role="error"]');
  errorEl.hidden = true;
  try {
    const [settings, productsResponse] = await Promise.all([fetchPublicSettings(), fetchProducts()]);
    ctx.update((state) => setProducts(setPublicSettings(state, settings), productsResponse.products));
  } catch {
    errorEl.textContent = 'Impossible de charger les produits. Réessayez.';
    errorEl.hidden = false;
  }
}

function render(container, state, ctx) {
  const productsEl = container.querySelector('[data-role="products"]');
  if (productsEl.childElementCount !== state.products.length) {
    productsEl.innerHTML = '';
    const wheelValues = buildWheelValues();
    for (const product of sortProductsForDisplay(state.products)) {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.dataset.productId = product.id;
      card.innerHTML = `
        <h3>${escapeHtml(product.name)}</h3>
        <p class="price">${formatEuros(product.price_per_kg)} €/kg</p>
        <div class="stepper">
          <button type="button" data-role="dec" aria-label="Diminuer la quantité">−</button>
          <div class="qty-wrap" data-role="qty-wrap">
            <input type="number" data-role="qty" min="0" step="0.5" value="0" aria-label="Quantité en kg" autocomplete="off" />
            <ul class="qty-wheel" data-role="wheel" hidden></ul>
          </div>
          <span class="unit">kg</span>
          <button type="button" data-role="inc" aria-label="Augmenter la quantité">+</button>
        </div>
      `;
      const wrap = card.querySelector('[data-role="qty-wrap"]');
      const qtyInput = card.querySelector('[data-role="qty"]');
      const wheelEl = card.querySelector('[data-role="wheel"]');

      for (const value of wheelValues) {
        const li = document.createElement('li');
        li.dataset.value = String(value);
        li.textContent = formatKgLabel(value);
        wheelEl.appendChild(li);
      }

      const openWheel = () => {
        // Une seule roulette ouverte à la fois entre cartes produit (surtout
        // utile sur mobile, où le stepper +/- est masqué par CSS — voir
        // styles.css — et où plusieurs cartes peuvent se chevaucher sinon).
        for (const otherWheel of productsEl.querySelectorAll('[data-role="wheel"]')) {
          if (otherWheel !== wheelEl) {
            otherWheel.hidden = true;
          }
        }
        syncWheel(wheelEl, Number(qtyInput.value) || 0);
        wheelEl.hidden = false;
      };
      qtyInput.addEventListener('focus', openWheel);
      qtyInput.addEventListener('click', openWheel);

      // Roulette numérique façon sélecteur mobile (date de naissance, etc.) :
      // affichée au clic/focus sur le champ ; un clic sur une valeur déclenche
      // la même mise à jour que la saisie au clavier, qui reste toujours
      // possible (le champ n'est jamais désactivé pendant que la roulette est
      // ouverte — pas le seul moyen de choisir une quantité).
      wheelEl.addEventListener('click', (event) => {
        const li = event.target.closest('li[data-value]');
        if (!li) return;
        qtyInput.value = li.dataset.value;
        qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        wheelEl.hidden = true;
      });

      document.addEventListener('click', (event) => {
        if (!wheelEl.hidden && !wrap.contains(event.target)) {
          wheelEl.hidden = true;
        }
      });

      card.querySelector('[data-role="dec"]').addEventListener('click', () => {
        ctx.update((s) => decrementProductQuantity(s, product.id, BUTTON_STEP_KG));
      });
      card.querySelector('[data-role="inc"]').addEventListener('click', () => {
        ctx.update((s) => incrementProductQuantity(s, product.id, BUTTON_STEP_KG));
      });
      // "change" (pas "input") : on laisse le client finir de taper (ex. "0,5"
      // ou "1.5" pour 500g/1,5 kg) avant d'arrondir au pas de 0,5 kg.
      qtyInput.addEventListener('change', (event) => {
        const parsed = Number(event.target.value.replace(',', '.'));
        ctx.update((s) => setProductQuantity(s, product.id, Number.isFinite(parsed) ? parsed : 0));
      });
      productsEl.appendChild(card);
    }
  }

  for (const card of productsEl.children) {
    const productId = card.dataset.productId;
    const qty = state.items[productId] || 0;
    const qtyInput = card.querySelector('[data-role="qty"]');
    // Ne jamais écraser la saisie en cours (focus) : seule une quantité
    // changée ailleurs (boutons +/-, autre carte) resynchronise le champ.
    if (document.activeElement !== qtyInput) {
      qtyInput.value = qty;
    }
    card.querySelector('[data-role="dec"]').disabled = qty <= 0;
    const wheelEl = card.querySelector('[data-role="wheel"]');
    if (!wheelEl.hidden) {
      syncWheel(wheelEl, qty);
    }
  }

  container.querySelector('[data-role="next"]').disabled = !hasAnyQuantity(state);

  const optionSelect = container.querySelector('[data-role="option"]');
  if (optionSelect.value !== state.option) {
    optionSelect.value = state.option;
  }
}

export { init, enter, render };
