// Base d'API : vide en production (Netlify proxy `/api/*` vers le backend,
// même origine, voir .ai/project-rules.md). Surchargeable via `window.API_BASE`
// pour un test manuel en local contre un backend sur un autre port/origine.
function getApiBase() {
  return typeof window !== 'undefined' && window.API_BASE ? window.API_BASE : '';
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
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

function fetchProducts() {
  return request('/api/products');
}

function fetchPublicSettings() {
  return request('/api/settings/public');
}

function checkPhone({ phone, nonce }) {
  return request('/api/check-phone', {
    method: 'POST',
    body: JSON.stringify({ phone, nonce }),
  });
}

function submitOrder({ first_name, last_name, phone, items, nonce, website = '' }) {
  return request('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ first_name, last_name, phone, items, nonce, website }),
  });
}

export { ApiError, fetchProducts, fetchPublicSettings, checkPhone, submitOrder };
