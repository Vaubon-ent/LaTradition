// Orchestrateur du dashboard admin (M-ADM2, docs/plan-implementation-admin.md).
// Même pattern que ../../js/app.js : sections jamais détruites/recréées,
// seule `hidden` change.

import { createInitialState, setView, setLoginError } from './adminState.js';
import { ApiError, onUnauthorized, checkSession, login, logout } from './adminApi.js';
import { mount as mountOrdersView } from './ordersView.js';

function start() {
  let state = createInitialState();

  const views = {
    loading: document.getElementById('view-loading'),
    login: document.getElementById('view-login'),
    dashboard: document.getElementById('view-dashboard'),
  };
  const loginForm = document.querySelector('[data-role="login-form"]');
  const loginErrorEl = document.querySelector('[data-role="login-error"]');
  const logoutButton = document.querySelector('[data-role="logout"]');
  const dashboardContent = document.querySelector('[data-role="dashboard-content"]');

  // M-DASH3 : appelé une seule fois par passage en vue dashboard (chargement
  // avec session valide, ou login réussi) — jamais depuis render(), qui est
  // aussi appelé pour d'autres transitions et refetcherait sinon à chaque fois.
  function mountDashboard() {
    if (dashboardContent) {
      mountOrdersView(dashboardContent);
    }
  }

  function update(mutator) {
    state = mutator(state);
    render();
  }

  function render() {
    Object.entries(views).forEach(([view, el]) => {
      el.hidden = view !== state.view;
    });
    loginErrorEl.hidden = !state.loginError;
    loginErrorEl.textContent = state.loginError || '';
  }

  // Câblé dès le démarrage, réutilisable sans modification par toutes les
  // futures vues métier qui appelleront adminFetch (.ai/decisions.md,
  // 2026-11-08) : une session qui expire en cours d'usage bascule vers la
  // vue login avec un message explicite, pas seulement au chargement.
  onUnauthorized(() => {
    update((s) => setLoginError(setView(s, 'login'), 'Session expirée, reconnectez-vous.'));
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = loginForm.elements.password.value;
    try {
      await login(password);
      loginForm.reset();
      update((s) => setLoginError(setView(s, 'dashboard'), null));
      mountDashboard();
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 429
          ? 'Trop de tentatives, réessayez plus tard.'
          : 'Mot de passe incorrect.';
      update((s) => setLoginError(s, message));
    }
  });

  logoutButton.addEventListener('click', async () => {
    try {
      await logout();
    } catch {
      // Le cookie peut déjà être absent/expiré : on bascule quand même vers login.
    }
    update((s) => setLoginError(setView(s, 'login'), null));
  });

  checkSession()
    .then(() => {
      update((s) => setView(s, 'dashboard'));
      mountDashboard();
    })
    .catch(() => update((s) => setView(s, 'login')));

  render();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}

export { start };
