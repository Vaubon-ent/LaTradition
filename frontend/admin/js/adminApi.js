// Client API du dashboard admin (M-ADM2, docs/plan-implementation-admin.md).
// Toutes les URLs sont écrites en absolu depuis la racine du domaine
// (jamais en relatif) — convention actée en Decision-Gel du 2026-11-08 pour
// neutraliser le risque propre à un sous-dossier (`/admin/`).

function getApiBase() {
  return typeof window !== 'undefined' && window.API_BASE ? window.API_BASE : '';
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler = null;

// Enregistré une seule fois par adminApp.js au démarrage : centralise la
// détection d'expiration de session (401) pour toutes les futures vues
// métier qui appelleront adminFetch, sans qu'elles aient à s'en soucier.
function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function request(path, options = {}) {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new ApiError(body?.error || `Erreur serveur (${response.status}).`, response.status);
  }
  return body;
}

function checkSession() {
  return request('/api/admin/session');
}

function login(password) {
  return request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

function logout() {
  return request('/api/admin/logout', { method: 'POST' });
}

// Wrapper générique destiné aux futures vues métier (commandes, production,
// produits, paramètres, export, clients) : si la réponse est 401, prévient
// le handler enregistré via onUnauthorized() avant de rejeter.
function adminFetch(path, options) {
  return request(path, options).catch((err) => {
    if (err instanceof ApiError && err.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw err;
  });
}

// Vue commandes du dashboard (M-DASH3, docs/plan-implementation-admin-dashboard.md).
function fetchOrders() {
  return adminFetch('/api/admin/orders');
}

function updateOrderStatus(id, status) {
  return adminFetch(`/api/admin/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// Payé / Récupéré découplés (demande directe du 2026-11-10) : payload partiel
// ({ paid_status } et/ou { picked_up }), chaque champ modifiable seul.
function updateOrderPayment(id, payload) {
  return adminFetch(`/api/admin/orders/${id}/payment`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

function saveOrdersExport() {
  return adminFetch('/api/admin/export/save', { method: 'POST' });
}

// Édition PII + lignes de commande (M-DASH5) : payload = { first_name,
// last_name, phone, items: [{ product_id, quantity_500g }] }.
function updateOrder(id, payload) {
  return adminFetch(`/api/admin/orders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// Suppression complète d'une commande (demande directe du 2026-11-09) :
// double confirmation gérée côté UI (orderEditModal.js), pas ici.
function deleteOrder(id) {
  return adminFetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
}

export {
  ApiError,
  onUnauthorized,
  checkSession,
  login,
  logout,
  adminFetch,
  fetchOrders,
  updateOrderStatus,
  updateOrderPayment,
  saveOrdersExport,
  updateOrder,
  deleteOrder,
};
