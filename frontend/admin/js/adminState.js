// État plat du dashboard admin (M-ADM2, docs/plan-implementation-admin.md).
// Fonctions pures, aucune dépendance au DOM — même pattern que ../../js/state.js.

function createInitialState() {
  return { view: 'loading', loginError: null };
}

function setView(state, view) {
  return { ...state, view };
}

function setLoginError(state, loginError) {
  return { ...state, loginError };
}

export { createInitialState, setView, setLoginError };
