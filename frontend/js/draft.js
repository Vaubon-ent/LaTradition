import { toDraft, applyDraft } from './state.js';

const DRAFT_KEY = 'boudins_draft_v1';

// `storage` est injectable (tests) ; en navigateur, appeler sans argument
// utilise `window.localStorage`.
function getStorage(storage) {
  return storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
}

function saveDraft(state, storage) {
  const target = getStorage(storage);
  if (!target) {
    return;
  }
  target.setItem(DRAFT_KEY, JSON.stringify(toDraft(state)));
}

// Ne journalise jamais le contenu lu/échoué (PII potentielles dans `pii`) :
// en cas d'erreur de parsing, on efface silencieusement le brouillon corrompu.
function loadDraft(storage) {
  const target = getStorage(storage);
  if (!target) {
    return null;
  }
  const raw = target.getItem(DRAFT_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    target.removeItem(DRAFT_KEY);
    return null;
  }
}

function clearDraft(storage) {
  const target = getStorage(storage);
  if (!target) {
    return;
  }
  target.removeItem(DRAFT_KEY);
}

function restoreDraftIntoState(state, storage) {
  return applyDraft(state, loadDraft(storage));
}

export { DRAFT_KEY, saveDraft, loadDraft, clearDraft, restoreDraftIntoState };
