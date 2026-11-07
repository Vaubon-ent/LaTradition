import { createInitialState, nextStep, previousStep, MAX_STEP } from './state.js';
import { saveDraft, clearDraft, restoreDraftIntoState } from './draft.js';
import * as welcome from './steps/welcome.js';
import * as order from './steps/order.js';
import * as pii from './steps/pii.js';
import * as recap from './steps/recap.js';
import * as confirmation from './steps/confirmation.js';

const STEP_MODULES = { 1: welcome, 2: order, 3: pii, 4: recap, 5: confirmation };

function start() {
  let state = restoreDraftIntoState(createInitialState());
  let draftSuppressed = false;
  let renderedStep = null;

  const containers = {};
  for (let step = 1; step <= MAX_STEP; step += 1) {
    containers[step] = document.getElementById(`step-${step}`);
  }
  const progressEl = document.getElementById('progress');

  const ctx = {
    getState: () => state,
    update,
    goNext: () => update(nextStep),
    goPrev: () => update(previousStep),
    clearDraftOnConfirmation,
  };

  function update(mutator) {
    state = mutator(state);
    if (!draftSuppressed) {
      saveDraft(state);
    }
    renderAll();
  }

  function clearDraftOnConfirmation() {
    clearDraft();
    draftSuppressed = true;
  }

  function renderAll() {
    for (let step = 1; step <= MAX_STEP; step += 1) {
      containers[step].hidden = step !== state.step;
    }
    progressEl.textContent = `Étape ${state.step}/${MAX_STEP}`;

    if (state.step !== renderedStep) {
      renderedStep = state.step;
      const mod = STEP_MODULES[state.step];
      if (mod.enter) {
        Promise.resolve(mod.enter(containers[state.step], ctx)).catch(() => {});
      }
    }
    STEP_MODULES[state.step].render?.(containers[state.step], state, ctx);
  }

  for (let step = 1; step <= MAX_STEP; step += 1) {
    STEP_MODULES[step].init(containers[step], ctx);
  }

  // Un brouillon restauré peut reprendre directement à une étape > 1 : les
  // données de l'étape Commande (nonce + produits) ne sont alors jamais
  // chargées via leur propre `enter()` (déclenché seulement sur transition).
  // On les charge ici une fois, sans jamais y charger le nonce à l'étape
  // Bienvenue (.ai/decisions.md).
  if (state.step > 1) {
    Promise.resolve(order.enter(containers[2], ctx)).catch(() => {});
  }

  renderAll();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}

export { start };
