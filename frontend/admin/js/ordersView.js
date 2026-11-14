// Vue commandes du dashboard admin (M-DASH3, docs/plan-implementation-admin-dashboard.md).
// DOM construit entièrement ici (index.html ne fournit qu'un conteneur vide,
// même pattern que le reste du socle admin).

import { fetchOrders, updateOrderPayment } from './adminApi.js';
import {
  PRODUCT_COLUMNS,
  OPTION_LABELS,
  optionLabel,
  PAID_STATUS_LABELS,
  kgForProduct,
  formatDate,
  formatKg,
  formatEuros,
  matchesFilters,
  sortOrders,
  computeTotals,
} from './ordersData.js';
import { mount as mountOrderEditModal } from './orderEditModal.js';

// clé de tri → libellé, dans l'ordre des colonnes du tableau.
const SORTABLE_COLUMNS = [
  { key: 'last_name', label: 'Nom' },
  { key: 'first_name', label: 'Prénom' },
  { key: 'phone', label: 'Tél.' },
  ...PRODUCT_COLUMNS.map((c) => ({ key: c.id, label: `${c.label} (kg)` })),
  { key: 'total_cents', label: 'Montant (€)' },
  { key: 'created_at', label: 'Date de commande' },
  { key: 'option', label: 'Option' },
  { key: 'paid', label: 'Payé' },
  { key: 'pickedUp', label: 'Récupéré' },
];

function sortableHeader({ key, label }) {
  return `<button type="button" class="sort-btn" data-sort-key="${key}">${label}<span class="sort-indicator" data-sort-indicator="${key}"></span></button>`;
}

function emptyFilters() {
  return {
    last_name: '',
    first_name: '',
    phone: '',
    created_at: '',
    kg: PRODUCT_COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: '' }), {}),
    option: 'all',
    paid: 'all', // 'all'|'non'|'en_attente'|'oui'
    pickedUp: 'all', // 'all'|'yes'|'no'
  };
}

// root : conteneur fourni par index.html (`[data-role="dashboard-content"]`),
// vidé et reconstruit entièrement à chaque mount() — appelé une seule fois
// par passage en vue dashboard (chargement avec session valide, ou login
// réussi), jamais à chaque rendu de adminApp.js.
function mount(root) {
  let orders = [];
  let filters = emptyFilters();
  let sort = { column: null, direction: 'asc' };

  root.innerHTML = `
    <p data-role="orders-message" hidden></p>
    <div class="orders-actions">
      <button type="button" data-role="close-campaign">Clôturer la campagne</button>
      <button type="button" data-role="new-campaign">Nouvelle campagne</button>
    </div>
    <div class="orders-summary" data-role="orders-summary"></div>
    <table class="orders-table">
      <thead>
        <tr>
          <th>${sortableHeader(SORTABLE_COLUMNS[0])}</th>
          <th>${sortableHeader(SORTABLE_COLUMNS[1])}</th>
          <th>${sortableHeader(SORTABLE_COLUMNS[2])}</th>
          ${PRODUCT_COLUMNS.map((c) => `<th>${sortableHeader({ key: c.id, label: `${c.label} (kg)` })}</th>`).join('')}
          <th>${sortableHeader({ key: 'total_cents', label: 'Montant (€)' })}</th>
          <th>${sortableHeader({ key: 'created_at', label: 'Date de commande' })}</th>
          <th class="col-option">${sortableHeader({ key: 'option', label: 'Option' })}</th>
          <th class="col-paid">${sortableHeader({ key: 'paid', label: 'Payé' })}</th>
          <th class="col-pickedup">${sortableHeader({ key: 'pickedUp', label: 'Récupéré' })}</th>
          <th>Actions</th>
        </tr>
        <tr class="orders-filter-row">
          <th><input type="text" data-filter="last_name" aria-label="Filtrer par nom" /></th>
          <th><input type="text" data-filter="first_name" aria-label="Filtrer par prénom" /></th>
          <th><input type="text" data-filter="phone" aria-label="Filtrer par téphone" /></th>
          ${PRODUCT_COLUMNS.map(
            (c) => `<th><input type="text" data-filter-kg="${c.id}" aria-label="Filtrer par kg ${c.label}" /></th>`
          ).join('')}
          <th></th>
          <th><input type="text" data-filter="created_at" aria-label="Filtrer par date" /></th>
          <th class="col-option">
            <select data-filter="option" aria-label="Filtrer par option">
              <option value="all">Tous</option>
              <option value="">Aucune</option>
              <option value="plus_piment">${OPTION_LABELS.plus_piment}</option>
              <option value="moins_piment">${OPTION_LABELS.moins_piment}</option>
            </select>
          </th>
          <th class="col-paid">
            <select data-filter="paid" aria-label="Filtrer par payé">
              <option value="all">Tous</option>
              <option value="non">${PAID_STATUS_LABELS.non}</option>
              <option value="en_attente">${PAID_STATUS_LABELS.en_attente}</option>
              <option value="oui">${PAID_STATUS_LABELS.oui}</option>
            </select>
          </th>
          <th class="col-pickedup">
            <select data-filter="pickedUp" aria-label="Filtrer par récupéré">
              <option value="all">Tous</option>
              <option value="yes">Oui</option>
              <option value="no">Non</option>
            </select>
          </th>
          <th></th>
        </tr>
      </thead>
      <tbody data-role="orders-tbody"></tbody>
    </table>
  `;

  const messageEl = root.querySelector('[data-role="orders-message"]');
  const summaryEl = root.querySelector('[data-role="orders-summary"]');
  const tbody = root.querySelector('[data-role="orders-tbody"]');
  const thead = root.querySelector('thead');

  // Totaux des commandes affichées (filtrées), pas forcément de toute la
  // saison — pour que filtrer (ex. "non payé") donne aussi des sous-totaux
  // utiles (demande utilisateur du 2026-11-08). Présentation en tuiles
  // (Option B proposée le 2026-11-10, choisie par l'utilisateur) : deux
  // tuiles "gros chiffre" pour ce qui compte le plus au premier coup d'œil
  // (nombre de commandes, montant), puis le détail kg par type + le total
  // dans un groupe de tuiles plus discret.
  function renderSummary(visible) {
    const totals = computeTotals(visible);
    summaryEl.innerHTML = `
      <div class="tile-grid">
        <div class="tile headline">
          <span class="label">Commande${totals.count === 1 ? '' : 's'}</span>
          <span class="value">${totals.count}</span>
        </div>
        <div class="tile headline">
          <span class="label">Montant total</span>
          <span class="value">${formatEuros(totals.amountCents)} €</span>
        </div>
      </div>
      <div class="sr-group-label">Kg par type de boudin</div>
      <div class="tile-sub-grid">
        ${PRODUCT_COLUMNS.map(
          (c) => `
          <div class="tile-sub">
            <span class="label">${c.label}</span>
            <span class="value">${formatKg(totals.kgByProduct[c.id])} kg</span>
          </div>
        `
        ).join('')}
        <div class="tile-sub total">
          <span class="label">Total</span>
          <span class="value">${formatKg(totals.kgTotal)} kg</span>
        </div>
      </div>
    `;
  }

  function showMessage(text, isError = false) {
    messageEl.hidden = !text;
    messageEl.textContent = text || '';
    messageEl.classList.toggle('error', Boolean(isError));
  }

  function updateSortIndicators() {
    root.querySelectorAll('[data-sort-indicator]').forEach((el) => {
      el.textContent = el.dataset.sortIndicator === sort.column ? (sort.direction === 'desc' ? ' ▼' : ' ▲') : '';
    });
  }

  function renderRows() {
    const visible = sortOrders(orders.filter((order) => matchesFilters(order, filters)), sort);
    renderSummary(visible);
    tbody.innerHTML = visible
      .map((order) => {
        const pickedUp = Boolean(order.picked_up);
        return `
      <tr data-order-id="${order.id}">
        <td data-label="Nom">${order.last_name}</td>
        <td data-label="Prénom">${order.first_name}</td>
        <td data-label="Tél.">${order.phone}</td>
        ${PRODUCT_COLUMNS.map((c) => `<td data-label="${c.label} (kg)">${formatKg(kgForProduct(order, c.id))}</td>`).join('')}
        <td data-label="Montant (€)">${formatEuros(order.total_cents)} €</td>
        <td data-label="Date de commande">${formatDate(order.created_at)}</td>
        <td data-label="Option">${optionLabel(order.option)}</td>
        <td data-label="Payé">
          <select data-role="paid-select" data-order-id="${order.id}">
            <option value="non" ${order.paid_status === 'non' ? 'selected' : ''}>${PAID_STATUS_LABELS.non}</option>
            <option value="en_attente" ${order.paid_status === 'en_attente' ? 'selected' : ''}>${PAID_STATUS_LABELS.en_attente}</option>
            <option value="oui" ${order.paid_status === 'oui' ? 'selected' : ''}>${PAID_STATUS_LABELS.oui}</option>
          </select>
          <span class="row-error" data-role="paid-error" hidden></span>
        </td>
        <td data-label="Récupéré">
          <select data-role="pickedup-select" data-order-id="${order.id}">
            <option value="non" ${!pickedUp ? 'selected' : ''}>Non</option>
            <option value="oui" ${pickedUp ? 'selected' : ''}>Oui</option>
          </select>
          <span class="row-error" data-role="pickedup-error" hidden></span>
        </td>
        <td>
          <button type="button" data-role="edit-order" data-order-id="${order.id}">Modifier</button>
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

  // Clic sur un en-tête : 1er clic → tri croissant, 2e clic sur la même
  // colonne → décroissant, clic sur une autre colonne → repart en croissant.
  // Délégation sur <thead> (pas de reconstruction des <th>, les filtres
  // gardent le focus) ; seuls les indicateurs ▲/▼ sont mis à jour en place.
  thead.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sort-key]');
    if (!button) return;
    const key = button.dataset.sortKey;
    sort = { column: key, direction: sort.column === key && sort.direction === 'asc' ? 'desc' : 'asc' };
    updateSortIndicators();
    renderRows();
  });

  // Payé / Récupéré découplés (demande directe du 2026-11-10) : deux
  // gestionnaires indépendants, aucune règle de transition entre eux
  // (contrairement à l'ancien handleStatusChange basé sur orders.status).
  async function handlePaidStatusChange(orderId, selectEl) {
    const order = orders.find((o) => String(o.id) === String(orderId));
    if (!order) return;
    const newValue = selectEl.value;
    if (newValue === order.paid_status) return;

    try {
      await updateOrderPayment(orderId, { paid_status: newValue });
      order.paid_status = newValue;
      renderRows();
    } catch {
      selectEl.value = order.paid_status;
      const errorEl = selectEl.closest('tr').querySelector('[data-role="paid-error"]');
      errorEl.hidden = false;
      errorEl.textContent = 'Échec de la mise à jour.';
    }
  }

  async function handlePickedUpChange(orderId, selectEl) {
    const order = orders.find((o) => String(o.id) === String(orderId));
    if (!order) return;
    const newValue = selectEl.value === 'oui';
    if (newValue === Boolean(order.picked_up)) return;

    try {
      await updateOrderPayment(orderId, { picked_up: newValue });
      order.picked_up = newValue ? 1 : 0;
      renderRows();
    } catch {
      selectEl.value = order.picked_up ? 'oui' : 'non';
      const errorEl = selectEl.closest('tr').querySelector('[data-role="pickedup-error"]');
      errorEl.hidden = false;
      errorEl.textContent = 'Échec de la mise à jour.';
    }
  }

  // Délégation sur tbody : les lignes sont reconstruites à chaque filtrage
  // ou changement de paiement, un listener par ligne serait perdu à chaque fois.
  tbody.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-role="paid-select"]')) {
      handlePaidStatusChange(target.dataset.orderId, target);
    } else if (target.matches('[data-role="pickedup-select"]')) {
      handlePickedUpChange(target.dataset.orderId, target);
    }
  });

  function loadOrders() {
    return fetchOrders()
      .then(({ orders: fetched }) => {
        orders = fetched;
        renderRows();
      })
      .catch(() => {
        showMessage('Impossible de charger les commandes.', true);
      });
  }

  // M-DASH5 : édition PII + lignes de commande, popup. Rechargement complet
  // après un enregistrement réussi (volume quelques centaines de
  // commandes/saison, pas besoin d'un merge local plus fin).
  const editModal = mountOrderEditModal(root, { onSaved: loadOrders });

  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-role="edit-order"]');
    if (!button) return;
    const order = orders.find((o) => String(o.id) === String(button.dataset.orderId));
    if (order) editModal.open(order);
  });

  // Boutons stub (décision retenue du 2026-11-08) : aucune logique métier ni
  // appel réseau, un simple message informatif.
  root.querySelector('[data-role="close-campaign"]').addEventListener('click', () => {
    showMessage('pas encore implémenté');
  });
  root.querySelector('[data-role="new-campaign"]').addEventListener('click', () => {
    showMessage('pas encore implémenté');
  });

  return loadOrders();
}

export { mount };
