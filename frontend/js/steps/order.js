import { fetchPublicSettings, fetchProducts } from '../api.js';
import {
  incrementProductQuantity,
  decrementProductQuantity,
  setProductQuantity,
  hasAnyQuantity,
  setProducts,
  setPublicSettings,
} from '../state.js';

// Incrément par défaut des boutons +/- : 1 kg (l'unité la plus courante).
// Le champ central reste un input libre pour les clients qui veulent
// commander par 500g (pas de 0,5 kg, jamais 100g — state.roundToStep).
const BUTTON_STEP_KG = 1;

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function formatEuros(cents) {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function init(container, ctx) {
  container.innerHTML = `
    <h2>Votre commande</h2>
    <div data-role="products"></div>
    <p data-role="error" class="error" hidden></p>
    <div class="nav">
      <button type="button" data-role="prev">Précédent</button>
      <button type="button" data-role="next" class="primary" disabled>Suivant</button>
    </div>
  `;
  container.querySelector('[data-role="prev"]').addEventListener('click', () => ctx.goPrev());
  container.querySelector('[data-role="next"]').addEventListener('click', () => ctx.goNext());
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
    for (const product of state.products) {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.dataset.productId = product.id;
      card.innerHTML = `
        <h3>${escapeHtml(product.name)}</h3>
        <p class="price">${formatEuros(product.price_per_kg)} €/kg</p>
        <div class="stepper">
          <button type="button" data-role="dec" aria-label="Diminuer la quantité">−</button>
          <input type="number" data-role="qty" min="0" step="0.5" value="0" aria-label="Quantité en kg" />
          <span class="unit">kg</span>
          <button type="button" data-role="inc" aria-label="Augmenter la quantité">+</button>
        </div>
      `;
      card.querySelector('[data-role="dec"]').addEventListener('click', () => {
        ctx.update((s) => decrementProductQuantity(s, product.id, BUTTON_STEP_KG));
      });
      card.querySelector('[data-role="inc"]').addEventListener('click', () => {
        ctx.update((s) => incrementProductQuantity(s, product.id, BUTTON_STEP_KG));
      });
      // "change" (pas "input") : on laisse le client finir de taper (ex. "0,5"
      // ou "1.5" pour 500g/1,5 kg) avant d'arrondir au pas de 0,5 kg.
      card.querySelector('[data-role="qty"]').addEventListener('change', (event) => {
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
  }

  container.querySelector('[data-role="next"]').disabled = !hasAnyQuantity(state);
}

export { init, enter, render };
