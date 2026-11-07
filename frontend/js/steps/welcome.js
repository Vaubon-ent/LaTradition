// Étape 1 — Bienvenue (F2, .ai/decisions.md 2026-11-07).
// Ne récupère jamais le nonce ici : seules `news`/`conceptionDate` issues de
// GET /api/settings/public sont utilisées, le nonce de cette réponse est
// ignoré (récupération différée à l'étape Commande, voir steps/order.js).

import { fetchPublicSettings } from '../api.js';
import { setPublicSettings } from '../state.js';

function init(container, ctx) {
  container.innerHTML = `
    <h2>Bienvenue</h2>
    <p data-role="news"></p>
    <button type="button" data-role="start" class="primary">Commander</button>
  `;
  container.querySelector('[data-role="start"]').addEventListener('click', () => ctx.goNext());
}

// Récupère `news` à chaque arrivée sur cette étape. Le nonce renvoyé par
// cet appel est délibérément ignoré (jamais stocké via setNonce) : un nonce
// frais sera récupéré à l'étape Commande (steps/order.js), seul moment où
// il sera réellement utilisé.
async function enter(container, ctx) {
  try {
    const settings = await fetchPublicSettings();
    ctx.update((state) => setPublicSettings(state, { ...settings, nonce: state.nonce }));
  } catch {
    // Non bloquant : le bouton "Commander" reste utilisable même si
    // l'actualité n'a pas pu être chargée (render() affiche alors le
    // message neutre par défaut).
  }
}

function render(container, state) {
  const newsEl = container.querySelector('[data-role="news"]');
  const hasNews = typeof state.news === 'string' && state.news.trim().length > 0;
  newsEl.textContent = hasNews ? state.news : "Pas d'actualité pour le moment.";
  newsEl.classList.toggle('muted', !hasNews);
}

export { init, enter, render };
