class ValidationError extends Error {}

// Hypothèse simplificatrice (clientèle française, non trisée dans le CDC) :
// seuls les formats français national (0X XX XX XX XX) et international
// (+33 X XX XX XX XX) sont acceptés, et normalisés vers la forme nationale
// pour que le dédoublonnage par téléphone (décision retenue) fonctionne
// quel que soit le format saisi par le client.
function normalizePhone(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ValidationError('Numéro de téléphone requis.');
  }
  const trimmed = raw.trim();
  if (!/^[0-9+ .-]+$/.test(trimmed)) {
    throw new ValidationError('Numéro de téléphone invalide.');
  }
  const digits = trimmed.replace(/[ .-]/g, '');

  if (/^0\d{9}$/.test(digits)) {
    return digits;
  }
  if (/^\+33\d{9}$/.test(digits)) {
    return `0${digits.slice(3)}`;
  }
  throw new ValidationError('Numéro de téléphone invalide.');
}

function validateName(raw, field) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ValidationError(`${field} requis.`);
  }
  return raw.trim();
}

function validateCustomerInput(body = {}) {
  return {
    first_name: validateName(body.first_name, 'Prénom'),
    last_name: validateName(body.last_name, 'Nom'),
    phone: normalizePhone(body.phone),
  };
}

// Préférence libre sur une commande (demande directe du 2026-11-10), '' = aucune
// préférence. Un seul champ par commande (pas par ligne de produit).
const ORDER_OPTION_VALUES = ['', 'plus_piment', 'moins_piment'];

function validateOrderOption(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return '';
  }
  if (typeof raw !== 'string' || !ORDER_OPTION_VALUES.includes(raw)) {
    throw new ValidationError('Option de commande invalide.');
  }
  return raw;
}

module.exports = {
  ValidationError,
  normalizePhone,
  validateName,
  validateCustomerInput,
  ORDER_OPTION_VALUES,
  validateOrderOption,
};
