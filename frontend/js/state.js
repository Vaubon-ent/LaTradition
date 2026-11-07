const MIN_STEP = 1;
const MAX_STEP = 5;
const QUANTITY_STEP_KG = 0.5;

function createInitialState() {
  return {
    step: MIN_STEP,
    nonce: null,
    news: '',
    pickup_address: '',
    contact_phone: '',
    conceptionDate: null,
    orderDeadline: null,
    locked: false,
    products: [],
    items: {},
    pii: { first_name: '', last_name: '', phone: '' },
    phoneDuplicateWarning: false,
    order: null,
  };
}

function clampStep(step) {
  return Math.min(MAX_STEP, Math.max(MIN_STEP, step));
}

function goToStep(state, step) {
  return { ...state, step: clampStep(step) };
}

function nextStep(state) {
  return goToStep(state, state.step + 1);
}

function previousStep(state) {
  return goToStep(state, state.step - 1);
}

// Arrondit au multiple de 0,5 le plus proche puis empêche toute quantité négative :
// l'unité de vente réelle (boudin vendu par 500g) ne permet jamais 100g ou moins
// (.ai/decisions.md, 2026-11-07).
function roundToStep(quantityKg) {
  const rounded = Math.round(quantityKg / QUANTITY_STEP_KG) * QUANTITY_STEP_KG;
  return Math.max(0, Math.round(rounded * 1000) / 1000);
}

function setProductQuantity(state, productId, quantityKg) {
  const safeQuantity = roundToStep(quantityKg);
  const items = { ...state.items };
  if (safeQuantity === 0) {
    delete items[productId];
  } else {
    items[productId] = safeQuantity;
  }
  return { ...state, items };
}

function incrementProductQuantity(state, productId, deltaKg = QUANTITY_STEP_KG) {
  const current = state.items[productId] || 0;
  return setProductQuantity(state, productId, current + deltaKg);
}

function decrementProductQuantity(state, productId, deltaKg = QUANTITY_STEP_KG) {
  const current = state.items[productId] || 0;
  return setProductQuantity(state, productId, current - deltaKg);
}

function hasAnyQuantity(state) {
  return Object.values(state.items).some((qty) => qty > 0);
}

function setPiiField(state, field, value) {
  return { ...state, pii: { ...state.pii, [field]: value } };
}

function setProducts(state, products) {
  return { ...state, products };
}

function setPublicSettings(
  state,
  { conceptionDate, orderDeadline, locked, nonce, news, pickup_address, contact_phone }
) {
  return {
    ...state,
    conceptionDate,
    orderDeadline,
    locked,
    nonce,
    news,
    pickup_address,
    contact_phone,
  };
}

function setNonce(state, nonce) {
  return { ...state, nonce };
}

function setPhoneDuplicateWarning(state, phoneDuplicateWarning) {
  return { ...state, phoneDuplicateWarning };
}

function setOrderResult(state, order) {
  return { ...state, order };
}

// Sous-ensemble persisté en brouillon (js/draft.js) : jamais le nonce (à usage
// unique, expire en 30 min, ne doit pas survivre à une fermeture de page) ni
// la liste des produits (re-récupérée à chaque arrivée à l'étape Commande).
function toDraft(state) {
  return { step: state.step, pii: state.pii, items: state.items };
}

function applyDraft(state, draft) {
  if (!draft) {
    return state;
  }
  return {
    ...state,
    step: clampStep(draft.step || MIN_STEP),
    pii: { ...state.pii, ...draft.pii },
    items: { ...draft.items },
  };
}

export {
  MIN_STEP,
  MAX_STEP,
  QUANTITY_STEP_KG,
  createInitialState,
  clampStep,
  goToStep,
  nextStep,
  previousStep,
  roundToStep,
  setProductQuantity,
  incrementProductQuantity,
  decrementProductQuantity,
  hasAnyQuantity,
  setPiiField,
  setProducts,
  setPublicSettings,
  setNonce,
  setPhoneDuplicateWarning,
  setOrderResult,
  toDraft,
  applyDraft,
};
