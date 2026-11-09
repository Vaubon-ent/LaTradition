import { checkPhone } from '../api.js';
import { setPiiField, setPhoneDuplicateWarning } from '../state.js';

const PHONE_PATTERN = /^(0\d{9}|\+33\d{9})$/;

function normalizeForClientCheck(raw) {
  return raw.replace(/[ .-]/g, '');
}

function validateClientSide(pii) {
  if (!pii.first_name.trim()) return 'Prénom requis.';
  if (!pii.last_name.trim()) return 'Nom requis.';
  if (!PHONE_PATTERN.test(normalizeForClientCheck(pii.phone || ''))) {
    return 'Numéro de téléphone invalide.';
  }
  return null;
}

function init(container, ctx) {
  container.innerHTML = `
    <h2>Vos coordonnées</h2>
    <form data-role="form" novalidate>
      <label>Prénom <input type="text" name="first_name" autocomplete="given-name" /></label>
      <label>Nom <input type="text" name="last_name" autocomplete="family-name" /></label>
      <label>Téléphone <input type="tel" name="phone" autocomplete="tel" /></label>
      <p data-role="validation-error" class="error" hidden></p>
      <p data-role="duplicate-warning" class="warning" hidden>
        Ce numéro semble déjà avoir une commande cette saison.
      </p>
      <div class="nav">
        <button type="button" data-role="prev">Précédent</button>
        <button type="submit" data-role="next" class="primary">Suivant</button>
      </div>
    </form>
  `;

  const form = container.querySelector('[data-role="form"]');
  for (const field of ['first_name', 'last_name', 'phone']) {
    form.elements[field].value = ctx.getState().pii[field] || '';
    form.elements[field].addEventListener('input', (event) => {
      ctx.update((state) => setPiiField(state, field, event.target.value));
      // #1 : le message d'erreur ne doit pas rester affiché une fois la
      // saisie corrigée, sans attendre un nouveau clic sur Suivant.
      const validationErrorEl = container.querySelector('[data-role="validation-error"]');
      if (!validationErrorEl.hidden && !validateClientSide(ctx.getState().pii)) {
        validationErrorEl.hidden = true;
      }
    });
  }

  // #7 : la touche Entrée dans un champ du formulaire doit déclencher la
  // même action que le clic sur Suivant (le bouton est aussi type="submit").
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleNext(container, ctx);
  });

  container.querySelector('[data-role="prev"]').addEventListener('click', () => ctx.goPrev());
}

async function handleNext(container, ctx) {
  const validationErrorEl = container.querySelector('[data-role="validation-error"]');
  const nextButton = container.querySelector('[data-role="next"]');
  const state = ctx.getState();
  const validationError = validateClientSide(state.pii);
  if (validationError) {
    validationErrorEl.textContent = validationError;
    validationErrorEl.hidden = false;
    return;
  }
  validationErrorEl.hidden = true;

  // #5 : feedback de clic pendant l'appel réseau check-phone (même bref) —
  // réactivé dans tous les cas (succès, erreur, doublon) avant de continuer.
  nextButton.disabled = true;
  const originalLabel = nextButton.textContent;
  nextButton.textContent = 'Vérification...';
  try {
    // L'appel B3 (check-phone) est un avertissement de confort : une erreur
    // réseau ou serveur ne doit jamais bloquer la navigation (.ai/decisions.md,
    // le rejet définitif reste géré par la contrainte serveur à la création).
    try {
      const { duplicate } = await checkPhone({ phone: state.pii.phone, nonce: state.nonce });
      ctx.update((s) => setPhoneDuplicateWarning(s, Boolean(duplicate)));
    } catch {
      ctx.update((s) => setPhoneDuplicateWarning(s, false));
    }
    ctx.goNext();
  } finally {
    nextButton.disabled = false;
    nextButton.textContent = originalLabel;
  }
}

function render(container, state) {
  container.querySelector('[data-role="duplicate-warning"]').hidden = !state.phoneDuplicateWarning;
}

export { init, render, validateClientSide };
