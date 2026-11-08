// Modale d'édition PII + commande du client sélectionné (M-DASH5,
// .ai/decisions.md 2026-11-08). Une seule <dialog> créée au montage et
// réutilisée pour chaque commande ouverte (même pattern que le reste de la
// vue commandes : pas de reconstruction DOM à chaque ouverture).

import { PRODUCT_COLUMNS, kgForProduct, buildEditItemsPayload } from './ordersData.js';
import { updateOrder } from './adminApi.js';

// root : conteneur dans lequel la <dialog> est insérée (son positionnement
// visuel ne dépend pas de ce conteneur, <dialog>.showModal() l'affiche dans
// le "top layer" par-dessus toute la page quel que soit son parent DOM).
// onSaved : appelé après un enregistrement réussi, pour que l'appelant
// recharge la liste (la commande modifiée peut avoir changé de PII/lignes).
function mount(root, { onSaved } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'order-edit-dialog';
  dialog.innerHTML = `
    <form data-role="order-edit-form">
      <h3>Modifier la commande</h3>
      <label>Nom <input type="text" name="last_name" required /></label>
      <label>Prénom <input type="text" name="first_name" required /></label>
      <label>Téléphone <input type="tel" name="phone" required /></label>
      <fieldset>
        <legend>Produits (kg)</legend>
        ${PRODUCT_COLUMNS.map(
          (c) =>
            `<label>${c.label} <input type="number" step="0.5" min="0" name="qty_${c.id}" data-role="qty-input" data-product-id="${c.id}" /></label>`
        ).join('')}
      </fieldset>
      <p data-role="order-edit-error" class="error" hidden></p>
      <div class="order-edit-actions">
        <button type="button" data-role="order-edit-cancel">Annuler</button>
        <button type="submit" class="primary" data-role="order-edit-save">Enregistrer</button>
      </div>
    </form>
  `;
  root.appendChild(dialog);

  const form = dialog.querySelector('[data-role="order-edit-form"]');
  const errorEl = dialog.querySelector('[data-role="order-edit-error"]');
  let currentOrderId = null;

  function showError(text) {
    errorEl.hidden = !text;
    errorEl.textContent = text || '';
  }

  // Repli sur l'attribut `open` si showModal()/close() sont absents
  // (environnement de test jsdom, ou très vieux navigateur) — comportement
  // identique dans tout navigateur moderne réel, qui implémente <dialog>.
  function openDialog() {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog() {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function open(order) {
    currentOrderId = order.id;
    showError(null);
    form.elements.last_name.value = order.last_name;
    form.elements.first_name.value = order.first_name;
    form.elements.phone.value = order.phone;
    PRODUCT_COLUMNS.forEach(({ id }) => {
      const kg = kgForProduct(order, id);
      form.elements[`qty_${id}`].value = kg > 0 ? kg : '';
    });
    openDialog();
  }

  dialog.querySelector('[data-role="order-edit-cancel"]').addEventListener('click', () => {
    closeDialog();
  });

  // preventDefault bloque la fermeture native pour garder la modale ouverte
  // tant que l'appel réseau n'a pas confirmé le succès (sinon une erreur
  // serveur fermerait la modale sans que l'admin voie le message).
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError(null);

    const quantitiesByProduct = {};
    dialog.querySelectorAll('[data-role="qty-input"]').forEach((el) => {
      quantitiesByProduct[el.dataset.productId] = parseFloat(el.value) || 0;
    });

    const payload = {
      last_name: form.elements.last_name.value,
      first_name: form.elements.first_name.value,
      phone: form.elements.phone.value,
      items: buildEditItemsPayload(quantitiesByProduct),
    };

    try {
      await updateOrder(currentOrderId, payload);
      closeDialog();
      if (onSaved) onSaved();
    } catch (err) {
      showError(err.message || "Échec de l'enregistrement.");
    }
  });

  return { open };
}

export { mount };
