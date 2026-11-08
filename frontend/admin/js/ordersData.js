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

const SORT_ACCESSORS = {
  last_name: (order) => order.last_name.toLowerCase(),
  first_name: (order) => order.first_name.toLowerCase(),
  phone: (order) => order.phone,
  created_at: (order) => order.created_at,
  paid: (order) => (isPaid(order.status) ? 1 : 0),
  pickedUp: (order) => (isPickedUp(order.status) ? 1 : 0),
};
for (const { id } of PRODUCT_COLUMNS) {
  SORT_ACCESSORS[id] = (order) => kgForProduct(order, id);
}

function compareValues(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// sort : { column: string|null, direction: 'asc'|'desc' }. Colonne inconnue
// ou absente → tableau renvoyé tel quel (ordre serveur, par défaut
// created_at DESC, voir ordersRepo.listOrders).
function sortOrders(orders, sort) {
  const getValue = sort?.column && SORT_ACCESSORS[sort.column];
  if (!getValue) return orders;
  const factor = sort.direction === 'desc' ? -1 : 1;
  return [...orders].sort((a, b) => factor * compareValues(getValue(a), getValue(b)));
}

// Pas 0,5 kg, jamais négatif (M-DASH5, édition client/commande) — même
// convention que le stepper du parcours client (frontend/js/state.js),
// réimplémentée ici en local pour ne pas créer de dépendance entre les deux
// bundles front (client vs admin), qui restent volontairement indépendants.
function roundToHalfKg(kg) {
  const rounded = Math.round(kg * 2) / 2;
  return rounded > 0 ? rounded : 0;
}

// kg (float, pas 0,5) → quantity_500g (entier), unité stockée en base.
function kgToQuantity500g(kg) {
  return Math.round(roundToHalfKg(kg) * 2);
}

// quantitiesByProduct : { [productId]: kg } (valeurs issues du formulaire
// d'édition) → payload items pour PUT /api/admin/orders/:id. Les quantités à
// 0 (ou absentes) sont omises : le serveur traite leur absence comme un
// retrait du produit de la commande (services/pricing.buildUpdatedOrderItems).
function buildEditItemsPayload(quantitiesByProduct) {
  return PRODUCT_COLUMNS.map(({ id }) => ({
    product_id: id,
    quantity_500g: kgToQuantity500g(quantitiesByProduct[id] || 0),
  })).filter((item) => item.quantity_500g > 0);
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
  sortOrders,
  roundToHalfKg,
  kgToQuantity500g,
  buildEditItemsPayload,
};
