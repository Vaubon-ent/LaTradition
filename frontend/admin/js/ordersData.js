// Logique pure (sans DOM) de la vue commandes du dashboard admin (M-DASH2,
// docs/plan-implementation-admin-dashboard.md). Testable isolément, même
// pattern que frontend/js/state.js.

const PRODUCT_COLUMNS = [
  { id: 'noir', label: 'Noir' },
  { id: 'blanc', label: 'Blanc' },
  { id: 'blanc_morue', label: 'Blanc morue' },
];

// Préférence libre par commande (demande directe du 2026-11-10), un seul
// champ pour toute la commande. Réimplémenté ici en local (pas d'import
// depuis frontend/js/) : les deux bundles front restent volontairement
// indépendants, même convention que formatEuros ci-dessous.
const OPTION_LABELS = {
  '': '',
  plus_piment: 'Plus de piment',
  moins_piment: 'Moins de piment',
};

function optionLabel(option) {
  return OPTION_LABELS[option] ?? '';
}

function kgForProduct(order, productId) {
  return order.items
    .filter((item) => item.product_id === productId)
    .reduce((total, item) => total + item.quantity_500g * 0.5, 0);
}

// Payé / Récupéré découplés (demande directe du 2026-11-10) : deux champs
// indépendants (`orders.paid_status`, `orders.picked_up`), plus aucun lien ni
// règle de transition entre eux — revient sur l'Option A du 2026-11-08, qui
// les mappait tous les deux sur `orders.status` ("récupéré" impliquait
// toujours "payé"). Une commande peut désormais être récupérée sans être
// payée (le père laisse parfois récupérer avant paiement).
const PAID_STATUS_LABELS = {
  non: 'Non',
  en_attente: 'En attente',
  oui: 'Oui',
};

function paidStatusLabel(paidStatus) {
  return PAID_STATUS_LABELS[paidStatus] ?? '';
}

function pickedUpLabel(pickedUp) {
  return pickedUp ? 'Oui' : 'Non';
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

// Réimplémenté ici en local (pas d'import depuis frontend/js/) : les deux
// bundles front (client vs admin) restent volontairement indépendants, même
// convention que roundToHalfKg/kgToQuantity500g ci-dessous.
function formatEuros(cents) {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
// blanc_morue }, paid: 'all'|'non'|'en_attente'|'oui', pickedUp: 'all'|'yes'|'no',
// option: 'all'|''|'plus_piment'|'moins_piment' }
function matchesFilters(order, filters) {
  if (!includesFilter(order.last_name, filters.last_name)) return false;
  if (!includesFilter(order.first_name, filters.first_name)) return false;
  if (!includesFilter(order.phone, filters.phone)) return false;
  if (!includesFilter(formatDate(order.created_at), filters.created_at)) return false;

  for (const { id } of PRODUCT_COLUMNS) {
    const kgFilter = filters.kg?.[id];
    if (kgFilter && !includesFilter(formatKg(kgForProduct(order, id)), kgFilter)) return false;
  }

  if (filters.paid !== undefined && filters.paid !== 'all' && order.paid_status !== filters.paid) return false;
  if (!matchesTriStateFilter(Boolean(order.picked_up), filters.pickedUp)) return false;
  if (filters.option !== undefined && filters.option !== 'all' && order.option !== filters.option) return false;

  return true;
}

// Ordre croissant naturel pour le statut de paiement à 3 états : non < en
// attente < oui.
const PAID_STATUS_ORDER = { non: 0, en_attente: 1, oui: 2 };

const SORT_ACCESSORS = {
  last_name: (order) => order.last_name.toLowerCase(),
  first_name: (order) => order.first_name.toLowerCase(),
  phone: (order) => order.phone,
  total_cents: (order) => order.total_cents,
  created_at: (order) => order.created_at,
  paid: (order) => PAID_STATUS_ORDER[order.paid_status] ?? 0,
  pickedUp: (order) => (order.picked_up ? 1 : 0),
  option: (order) => optionLabel(order.option),
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

// Totaux affichés au-dessus du tableau (demande utilisateur du 2026-11-08) :
// calculés sur les commandes passées en argument (le tableau filtré/visible,
// pas forcément toute la saison), pour que filtrer donne aussi des
// sous-totaux utiles — pas seulement les lignes.
function computeTotals(orders) {
  const kgByProduct = PRODUCT_COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {});
  let amountCents = 0;
  for (const order of orders) {
    amountCents += order.total_cents;
    for (const { id } of PRODUCT_COLUMNS) {
      kgByProduct[id] += kgForProduct(order, id);
    }
  }
  const kgTotal = Object.values(kgByProduct).reduce((sum, kg) => sum + kg, 0);
  return { count: orders.length, amountCents, kgByProduct, kgTotal };
}

export {
  PRODUCT_COLUMNS,
  OPTION_LABELS,
  optionLabel,
  PAID_STATUS_LABELS,
  paidStatusLabel,
  pickedUpLabel,
  kgForProduct,
  formatDate,
  formatKg,
  formatEuros,
  matchesFilters,
  sortOrders,
  roundToHalfKg,
  kgToQuantity500g,
  buildEditItemsPayload,
  computeTotals,
};
