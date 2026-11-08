// Vue commandes du dashboard admin (M-DASH3, docs/plan-implementation-admin-dashboard.md).
// DOM construit entièrement ici (index.html ne fournit qu'un conteneur vide,
// même pattern que le reste du socle admin).

import { fetchOrders, updateOrderStatus, saveOrdersExport } from './adminApi.js';
import {
  PRODUCT_COLUMNS,
  kgForProduct,
  isPaid,
  isPickedUp,
  statusAfterPaidToggle,
  statusAfterPickedUpToggle,
  formatDate,
  formatKg,
  matchesFilters,
} from './ordersData.js';

function emptyFilters() {
  return {
    last_name: '',
    first_name: '',
    phone: '',
    created_at: '',
    kg: PRODUCT_COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: '' }), {}),
    paid: 'all',
    pickedUp: 'all',
  };
}

// root : conteneur fourni par index.html (`[data-role="dashboard-content"]`),
// vidé et reconstruit entièrement à chaque mount() — appelé une seule fois
// par passage en vue dashboard (chargement avec session valide, ou login
// réussi), jamais à chaque rendu de adminApp.js.
function mount(root) {
  let orders = [];
  let filters = emptyFilters();

  root.innerHTML = `
    <p data-role="orders-message" hidden></p>
    <div class="orders-actions">
      <button type="button" data-role="export-orders">Exporter (.xlsx)</button>
      <button type="button" data-role="close-campaign">Clôturer la campagne</button>
      <button type="button" data-role="new-campaign">Nouvelle campagne</button>
    </div>
    <table class="orders-table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Prénom</th>
          <th>Tél.</th>
          ${PRODUCT_COLUMNS.map((c) => `<th>${c.label} (kg)</th>`).join('')}
          <th>Date de commande</th>
          <th>Payé</th>
          <th>Récupéré</th>
        </tr>
        <tr class="orders-filter-row">
          <th><input type="text" data-filter="last_name" aria-label="Filtrer par nom" /></th>
          <th><input type="text" data-filter="first_name" aria-label="Filtrer par prénom" /></th>
          <th><input type="text" data-filter="phone" aria-label="Filtrer par téphone" /></th>
          ${PRODUCT_COLUMNS.map(
            (c) => `<th><input type="text" data-filter-kg="${c.id}" aria-label="Filtrer par kg ${c.label}" /></th>`
          ).join('')}
          <th><input type="text" data-filter="created_at" aria-label="Filtrer par date" /></th>
          <th>
            <select data-filter="paid" aria-label="Filtrer par payé">
              <option value="all">Tous</option>
              <option value="yes">Oui</option>
              <option value="no">Non</option>
            </select>
          </th>
          <th>
            <select data-filter="pickedUp" aria-label="Filtrer par récupéré">
              <option value="all">Tous</option>
              <option value="yes">Oui</option>
              <option value="no">Non</option>
            </select>
          </th>
        </tr>
      </thead>
      <tbody data-role="orders-tbody"></tbody>
    </table>
  `;

  const messageEl = root.querySelector('[data-role="orders-message"]');
  const tbody = root.querySelector('[data-role="orders-tbody"]');

  function showMessage(text, isError = false) {
    messageEl.hidden = !text;
    messageEl.textContent = text || '';
    messageEl.classList.toggle('error', Boolean(isError));
  }

  function renderRows() {
    const visible = orders.filter((order) => matchesFilters(order, filters));
    tbody.innerHTML = visible
      .map((order) => {
        const paid = isPaid(order.status);
        const pickedUp = isPickedUp(order.status);
        return `
      <tr data-order-id="${order.id}">
        <td>${order.last_name}</td>
        <td>${order.first_name}</td>
        <td>${order.phone}</td>
        ${PRODUCT_COLUMNS.map((c) => `<td>${formatKg(kgForProduct(order, c.id))}</td>`).join('')}
        <td>${formatDate(order.created_at)}</td>
        <td>
          <input type="checkbox" data-role="paid-checkbox" data-order-id="${order.id}" ${paid ? 'checked' : ''} ${pickedUp ? 'disabled' : ''} />
          <span class="row-error" data-role="paid-error" hidden></span>
        </td>
        <td>
          <input type="checkbox" data-role="pickedup-checkbox" data-order-id="${order.id}" ${pickedUp ? 'checked' : ''} />
          <span class="row-error" data-role="pickedup-error" hidden></span>
        </td>
      </tr>
    `;
      })
      .join('');
  }

  root.querySelectorAll('[data-filter]').forEach((el) => {
    const apply = () => {
      filters = { ...filters, [el.dataset.filter]: el.value };
      renderRows();
    };
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
  });
  root.querySelectorAll('[data-filter-kg]').forEach((el) => {
    el.addEventListener('input', () => {
      filters = { ...filters, kg: { ...filters.kg, [el.dataset.filterKg]: el.value } };
      renderRows();
    });
  });

  async function handleStatusChange(orderId, checkbox, toggleFn, errorSelector) {
    const order = orders.find((o) => String(o.id) === String(orderId));
    if (!order) return;
    const newStatus = toggleFn(order.status, checkbox.checked);
    if (newStatus === order.status) return;

    try {
      await updateOrderStatus(orderId, newStatus);
      order.status = newStatus;
      renderRows();
    } catch (err) {
      checkbox.checked = !checkbox.checked;
      const errorEl = checkbox.closest('tr').querySelector(errorSelector);
      errorEl.hidden = false;
      errorEl.textContent = 'Échec de la mise à jour.';
    }
  }

  // Délégation sur tbody : les lignes sont reconstruites à chaque filtrage
  // ou changement de statut, un listener par case serait perdu à chaque fois.
  tbody.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-role="paid-checkbox"]')) {
      handleStatusChange(target.dataset.orderId, target, statusAfterPaidToggle, '[data-role="paid-error"]');
    } else if (target.matches('[data-role="pickedup-checkbox"]')) {
      handleStatusChange(target.dataset.orderId, target, statusAfterPickedUpToggle, '[data-role="pickedup-error"]');
    }
  });

  root.querySelector('[data-role="export-orders"]').addEventListener('click', async () => {
    try {
      const result = await saveOrdersExport();
      showMessage(`Export enregistré : ${result.path}`);
    } catch (err) {
      showMessage("Échec de l'export.", true);
    }
  });

  // Boutons stub (décision retenue du 2026-11-08) : aucune logique métier ni
  // appel réseau, un simple message informatif.
  root.querySelector('[data-role="close-campaign"]').addEventListener('click', () => {
    showMessage('pas encore implémenté');
  });
  root.querySelector('[data-role="new-campaign"]').addEventListener('click', () => {
    showMessage('pas encore implémenté');
  });

  return fetchOrders()
    .then(({ orders: fetched }) => {
      orders = fetched;
      renderRows();
    })
    .catch(() => {
      showMessage('Impossible de charger les commandes.', true);
    });
}

export { mount };
