import { submitOrder } from '../api.js';
import { setOrderResult, formatKgLabel, estimateLineCents } from '../state.js';

function formatEuros(cents) {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function init(container, ctx) {
  container.innerHTML = `
    <h2>Récapitulatif</h2>
    <div class="receipt" data-role="lines"></div>
    <div class="receipt-total" data-role="total-line">
      <span>Estimation</span>
      <span data-role="total">0,00 €</span>
    </div>
    <p class="receipt-note muted" data-role="note">
      Montant définitif confirmé à la validation.
    </p>
    <p data-role="error" class="error" hidden></p>
    <div class="nav">
      <button type="button" data-role="prev">Précédent</button>
      <button type="button" data-role="submit" class="primary">Valider la commande</button>
    </div>
  `;
  container.querySelector('[data-role="prev"]').addEventListener('click', () => ctx.goPrev());
  container.querySelector('[data-role="submit"]').addEventListener('click', () => handleSubmit(container, ctx));
}

// Le total n'est jamais calculé côté front : seule la réponse serveur de
// POST /api/orders (total_cents) fait foi (.ai/decisions.md). En cas
// d'erreur, la saisie (PII + quantités) n'est jamais perdue, pour permettre
// une correction sans tout ressaisir.
async function handleSubmit(container, ctx) {
  const errorEl = container.querySelector('[data-role="error"]');
  errorEl.hidden = true;
  const state = ctx.getState();
  const items = Object.entries(state.items).map(([product_id, quantityKg]) => ({
    product_id,
    quantity_500g: Math.round(quantityKg * 2),
  }));

  try {
    const order = await submitOrder({
      first_name: state.pii.first_name,
      last_name: state.pii.last_name,
      phone: state.pii.phone,
      items,
      nonce: state.nonce,
    });
    ctx.update((s) => setOrderResult(s, order));
    ctx.goNext();
  } catch (err) {
    errorEl.textContent = err.message || 'Impossible de valider la commande. Réessayez.';
    errorEl.hidden = false;
  }
}

// Estimation affichée ici uniquement (ne révise pas F5 : la commande
// réellement soumise, handleSubmit ci-dessus, continue de n'envoyer que les
// quantités — le calcul et le total qui font foi restent exclusivement
// serveur, affichés à l'étape Confirmation).
function render(container, state) {
  const linesEl = container.querySelector('[data-role="lines"]');
  linesEl.innerHTML = '';
  const productsById = Object.fromEntries(state.products.map((p) => [p.id, p]));
  let totalCents = 0;
  for (const [productId, quantityKg] of Object.entries(state.items)) {
    const product = productsById[productId];
    const label = product ? product.name : productId;
    const lineCents = product ? estimateLineCents(product, quantityKg) : 0;
    totalCents += lineCents;

    const line = document.createElement('div');
    line.className = 'receipt-line';
    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = `${label} — ${formatKgLabel(quantityKg)} kg`;
    const amountEl = document.createElement('span');
    amountEl.className = 'amount';
    amountEl.textContent = `${formatEuros(lineCents)} €`;
    line.append(labelEl, amountEl);
    linesEl.appendChild(line);
  }
  container.querySelector('[data-role="total"]').textContent = `${formatEuros(totalCents)} €`;
}

export { init, render };
