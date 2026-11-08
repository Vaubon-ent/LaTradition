// Logique pure (sans DOM) de la vue commandes du dashboard admin (M-DASH2,
// docs/plan-implementation-admin-dashboard.md). Testable isolément, même
// pattern que frontend/js/state.js.

const PRODUCT_COLUMNS = [
  { id: 'noir', label: 'Noir' },
  { id: 'blanc', label: 'Blanc' },
  { id: 'blanc_morue', label: 'Blanc morue' },
];

function kgForProduct(order, productId) {
  return order.items
    .filter((item) => item.product_id === productId)
    .reduce((total, item) => total + item.quantity_500g * 0.5, 0);
}

// Mapping payé/récupéré sur orders.status existant, sans migration de
// schéma (Option A, décision retenue du 2026-11-08) : "récupéré" implique
// toujours "payé" dans ce modèle.
function isPaid(status) {
  return status === 'payee' || status === 'retiree';
}

function isPickedUp(status) {
  return status === 'retiree';
}

// Règle de transition actée en Decision-Gel du 2026-11-08. La case "Payé"
// est désactivée côté vue tant que "Récupéré" est cochée (impossible de
// représenter "récupéré mais pas payé") : décocher "Payé" depuis `retiree`
// est donc un no-op défensif, jamais déclenché par l'UI dans cet état.
function statusAfterPaidToggle(currentStatus, checked) {
  if (checked) {
    return currentStatus === 'recue' ? 'payee' : currentStatus;
  }
  return currentStatus === 'payee' ? 'recue' : currentStatus;
}

function statusAfterPickedUpToggle(currentStatus, checked) {
  if (checked) {
    return 'retiree';
  }
  return currentStatus === 'retiree' ? 'payee' : currentStatus;
}

function formatDate(createdAt) {
  if (!createdAt) return '';
  const isoLike = createdAt.replace(' ', 'T') + 'Z';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(
    new Date(isoLike)
  );
}

function formatKg(kg) {
  return kg.toLocaleString('fr-FR');
}

function includesFilter(value, filterText) {
  if (!filterText) return true;
  return String(value).toLowerCase().includes(filterText.toLowerCase());
}

function matchesTriStateFilter(actual, filterValue) {
  if (filterValue === 'yes') return actual === true;
  if (filterValue === 'no') return actual === false;
  return true;
}

// filters : { last_name, first_name, phone, created_at, kg: { noir, blanc,
// blanc_morue }, paid: 'all'|'yes'|'no', pickedUp: 'all'|'yes'|'no' }
function matchesFilters(order, filters) {
  if (!includesFilter(order.last_name, filters.last_name)) return false;
  if (!includesFilter(order.first_name, filters.first_name)) return false;
  if (!includesFilter(order.phone, filters.phone)) return false;
  if (!includesFilter(formatDate(order.created_at), filters.created_at)) return false;

  for (const { id } of PRODUCT_COLUMNS) {
    const kgFilter = filters.kg?.[id];
    if (kgFilter && !includesFilter(formatKg(kgForProduct(order, id)), kgFilter)) return false;
  }

  if (!matchesTriStateFilter(isPaid(order.status), filters.paid)) return false;
  if (!matchesTriStateFilter(isPickedUp(order.status), filters.pickedUp)) return false;

  return true;
}

export {
  PRODUCT_COLUMNS,
  kgForProduct,
  isPaid,
  isPickedUp,
  statusAfterPaidToggle,
  statusAfterPickedUpToggle,
  formatDate,
  formatKg,
  matchesFilters,
};
