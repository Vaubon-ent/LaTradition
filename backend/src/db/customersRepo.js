// Le client est conservé d'une saison à l'autre (CDC §7.3, objectif 5) : une
// commande réutilise le client existant si le téléphone est déjà connu,
// plutôt que d'en recréer un. Le nom/prénom déjà enregistrés ne sont pas mis
// à jour ici si le client les a saisis différemment la 2e fois (hors scope V1).
// Lecture seule, utilisée par le check de doublon en live (routes/checkPhone.js) :
// ne crée jamais de client, contrairement à findOrCreateCustomer.
function findCustomerByPhone(db, phone) {
  return db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
}

function findOrCreateCustomer(db, { first_name, last_name, phone }) {
  const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
  if (existing) {
    return existing.id;
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?)')
    .run(first_name, last_name, phone);
  return lastInsertRowid;
}

const crypto = require('crypto');

// Anonymisation manuelle (CDC §7.3, M8) : la durée de conservation reste une
// décision en suspens (.ai/decisions.md), donc aucun déclenchement
// automatique pour l'instant — seulement cet appel explicite depuis l'admin.
// Les commandes/order_items ne sont pas touchés (historique de production
// conservé) ; seul le nom et le téléphone (PII) sont remplacés. Le téléphone
// est remplacé par un hash pour respecter la contrainte UNIQUE sans
// réintroduire de PII en clair.
function anonymizeCustomer(db, id) {
  const placeholderPhone = `anon-${crypto.createHash('sha256').update(`${id}-${Date.now()}`).digest('hex').slice(0, 16)}`;
  const result = db
    .prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ? WHERE id = ?')
    .run('Anonymisé', 'Anonymisé', placeholderPhone, id);
  return result.changes > 0;
}

class DuplicatePhoneError extends Error {}

// Édition PII par l'admin (M-DASH5) : le téléphone reste UNIQUE (schema.js),
// donc on traduit sa violation en erreur métier lisible — sauf si le numéro
// demandé est déjà celui du client qu'on modifie (no-op légitime), seul cas
// autorisé (décision retenue du 2026-11-08). Pensée pour être appelée à
// l'intérieur d'une transaction plus large (ordersRepo.applyOrderEdit).
function updateCustomerPii(db, id, { first_name, last_name, phone }) {
  const existingWithPhone = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
  if (existingWithPhone && existingWithPhone.id !== id) {
    throw new DuplicatePhoneError('Ce numéro de téléphone est déjà utilisé par un autre client.');
  }
  const result = db
    .prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ? WHERE id = ?')
    .run(first_name, last_name, phone, id);
  return result.changes > 0;
}

module.exports = {
  findCustomerByPhone,
  findOrCreateCustomer,
  anonymizeCustomer,
  updateCustomerPii,
  DuplicatePhoneError,
};
