const { updateCustomerPii } = require('./customersRepo');
const { consumeNonce } = require('./nonceStore');

class DuplicateOrderError extends Error {}

// La contrainte UNIQUE (customer_id, season) de la table `orders` (M2) est le
// mécanisme réel qui implémente la décision « dédoublonnage par téléphone » :
// on se contente ici de traduire sa violation en erreur métier lisible.
//
// `nonceInfo` (optionnel, absent pour les appels de test qui fabriquent des
// commandes directement) est consommé dans la même transaction que
// l'insertion : si la commande échoue plus loin (doublon téléphone/saison),
// tout est annulé ensemble, nonce compris — il reste donc réutilisable pour
// une correction (ex. téléphone corrigé) tant que son TTL n'est pas dépassé.
// Révisé le 2026-11-09 (bug P0, audit UX) : auparavant consommé en amont, dans
// `middleware/antiAbuseGuard.js`, avant même de savoir si la commande serait
// créée.
function createOrder(db, { customerId, season, lines, totalCents, nonceInfo, option = '' }) {
  const insertOrder = db.prepare(
    'INSERT INTO orders (customer_id, season, total_cents, option) VALUES (@customerId, @season, @totalCents, @option)'
  );
  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, quantity_500g, unit_price_cents, line_total_cents)
     VALUES (@order_id, @product_id, @quantity_500g, @unit_price_cents, @line_total_cents)`
  );

  const run = db.transaction(() => {
    if (nonceInfo) {
      consumeNonce(db, nonceInfo);
    }

    let orderId;
    try {
      const result = insertOrder.run({ customerId, season, totalCents, option });
      orderId = result.lastInsertRowid;
    } catch (err) {
      throw new DuplicateOrderError('Une commande existe déjà pour ce client sur cette saison.');
    }

    for (const line of lines) {
      insertItem.run({ order_id: orderId, ...line });
    }

    return orderId;
  });

  return run();
}

// Utilisé par le check de doublon en live (routes/checkPhone.js) : traduit en
// booléen simple la même contrainte UNIQUE (customer_id, season) que
// createOrder, sans tenter d'insérer quoi que ce soit.
function hasOrderForSeason(db, customerId, season) {
  const row = db
    .prepare('SELECT 1 FROM orders WHERE customer_id = ? AND season = ?')
    .get(customerId, season);
  return Boolean(row);
}

// Liste des commandes pour l'admin (CDC §6.2) : nom/prénom/téléphone du
// client + lignes de produits, avec filtres optionnels statut/saison et
// recherche nom/téléphone. Volume attendu (quelques centaines de commandes
// par saison) : une requête par commande pour les lignes (N+1) reste
// largement suffisante, pas besoin d'optimiser.
function listOrders(db, { status, season, search } = {}) {
  let sql = `
    SELECT orders.id, orders.season, orders.status, orders.total_cents, orders.paid_online,
           orders.option, orders.paid_status, orders.picked_up, orders.created_at, orders.updated_at,
           customers.first_name, customers.last_name, customers.phone
    FROM orders
    JOIN customers ON customers.id = orders.customer_id
    WHERE 1 = 1
  `;
  const params = {};
  if (status) {
    sql += ' AND orders.status = @status';
    params.status = status;
  }
  if (season) {
    sql += ' AND orders.season = @season';
    params.season = season;
  }
  if (search) {
    sql += ' AND (customers.first_name LIKE @search OR customers.last_name LIKE @search OR customers.phone LIKE @search)';
    params.search = `%${search}%`;
  }
  sql += ' ORDER BY orders.created_at DESC';

  const orders = db.prepare(sql).all(params);
  const itemsStmt = db.prepare(`
    SELECT order_items.product_id, products.name, order_items.quantity_500g,
           order_items.unit_price_cents, order_items.line_total_cents
    FROM order_items
    JOIN products ON products.id = order_items.product_id
    WHERE order_items.order_id = ?
    ORDER BY order_items.id
  `);
  for (const order of orders) {
    order.items = itemsStmt.all(order.id);
  }
  return orders;
}

const ORDER_STATUSES = ['recue', 'payee', 'retiree'];

function updateOrderStatus(db, id, status) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`Statut invalide : ${status}`);
  }
  const result = db
    .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
  return result.changes > 0;
}

const PAID_STATUSES = ['non', 'en_attente', 'oui'];

// Payé / Récupéré découplés (demande directe du 2026-11-10, .ai/decisions.md
// — revient sur l'Option A du 2026-11-08) : deux champs indépendants, chacun
// modifiable seul, sans aucune règle de transition entre eux (contrairement à
// l'ancien `updateOrderStatus`/`status`, laissé inchangé pour compatibilité
// avec le filtre `?status=` et l'export existants, mais plus jamais écrit par
// le dashboard). `paid_status`/`picked_up` optionnels indépendamment : au
// moins un des deux doit être fourni (validé par le routeur).
function updateOrderPaymentState(db, id, { paid_status, picked_up } = {}) {
  if (paid_status !== undefined && !PAID_STATUSES.includes(paid_status)) {
    throw new Error(`Statut de paiement invalide : ${paid_status}`);
  }
  const sets = [];
  const params = { id };
  if (paid_status !== undefined) {
    sets.push('paid_status = @paid_status');
    params.paid_status = paid_status;
  }
  if (picked_up !== undefined) {
    sets.push('picked_up = @picked_up');
    params.picked_up = picked_up ? 1 : 0;
  }
  const result = db
    .prepare(`UPDATE orders SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = @id`)
    .run(params);
  return result.changes > 0;
}

// Édition admin (M-DASH5) : commande + client associé. Retourne undefined si
// la commande n'existe pas (le routeur traduit ça en 404).
function getOrderById(db, id) {
  return db.prepare('SELECT id, customer_id, season, status, total_cents FROM orders WHERE id = ?').get(id);
}

// Lignes brutes (avec id, nécessaire pour les UPDATE/DELETE ciblés d'une
// édition) — distinct de listOrders, qui joint le nom du produit pour
// l'affichage mais n'expose jamais cet id interne.
function getOrderItemsForEdit(db, orderId) {
  return db
    .prepare('SELECT id, product_id, quantity_500g, unit_price_cents FROM order_items WHERE order_id = ? ORDER BY id')
    .all(orderId);
}

// Applique en une seule transaction le diff calculé par
// services/pricing.buildUpdatedOrderItems ainsi que la mise à jour PII du
// client associé : une violation de l'unicité du téléphone (DuplicatePhoneError,
// customersRepo.updateCustomerPii) annule tout le reste (aucune ligne de
// commande modifiée si le PII est rejeté, et inversement).
function applyOrderEdit(db, orderId, customerId, pii, { inserts, updates, deleteIds, totalCents }) {
  const deleteItemStmt = db.prepare('DELETE FROM order_items WHERE id = ?');
  const updateItemStmt = db.prepare('UPDATE order_items SET quantity_500g = ?, line_total_cents = ? WHERE id = ?');
  const insertItemStmt = db.prepare(
    `INSERT INTO order_items (order_id, product_id, quantity_500g, unit_price_cents, line_total_cents)
     VALUES (@order_id, @product_id, @quantity_500g, @unit_price_cents, @line_total_cents)`
  );
  const updateOrderTotalStmt = db.prepare("UPDATE orders SET total_cents = ?, updated_at = datetime('now') WHERE id = ?");

  const run = db.transaction(() => {
    updateCustomerPii(db, customerId, pii);
    for (const id of deleteIds) deleteItemStmt.run(id);
    for (const update of updates) updateItemStmt.run(update.quantity_500g, update.line_total_cents, update.id);
    for (const insert of inserts) insertItemStmt.run({ order_id: orderId, ...insert });
    updateOrderTotalStmt.run(totalCents, orderId);
  });

  run();
}

// Suppression admin d'une commande (demande directe du 2026-11-09) : le
// client (table `customers`) n'est jamais supprimé, seulement la commande et
// ses lignes — cohérent avec la conservation des données clients tranchée
// ad vitam (.ai/decisions.md) et avec l'absence de CASCADE sur les clés
// étrangères (schema.js), donc suppression explicite des lignes d'abord.
// Retourne false si la commande n'existait pas (le routeur traduit en 404).
function deleteOrder(db, id) {
  const deleteItems = db.prepare('DELETE FROM order_items WHERE order_id = ?');
  const deleteOrderStmt = db.prepare('DELETE FROM orders WHERE id = ?');

  const run = db.transaction(() => {
    deleteItems.run(id);
    return deleteOrderStmt.run(id);
  });

  const result = run();
  return result.changes > 0;
}

// Suppression admin de toutes les commandes d'une saison (demande directe du
// 2026-11-10, usage Postman direct — pas d'écran dédié) : même principe que
// deleteOrder (le client n'est jamais supprimé, seulement les commandes et
// leurs lignes). Retourne le nombre de commandes supprimées (0 si la saison
// n'a aucune commande, pas une erreur).
function deleteOrdersBySeason(db, season) {
  const deleteItems = db.prepare(
    'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE season = ?)'
  );
  const deleteOrders = db.prepare('DELETE FROM orders WHERE season = ?');

  const run = db.transaction(() => {
    deleteItems.run(season);
    return deleteOrders.run(season);
  });

  const result = run();
  return result.changes;
}

// Totaux de production (CDC §6.4) : somme des quantités (en unités de 500 g)
// par produit, converties en kg, sur toutes les commandes de la saison
// (aucune commande n'est jamais annulée, cf. CDC §5.4 — donc pas de filtre
// de statut ici).
function getProductionTotals(db, season) {
  const rows = db
    .prepare(
      `SELECT products.id AS product_id, products.name,
              SUM(order_items.quantity_500g) AS total_500g
       FROM order_items
       JOIN orders ON orders.id = order_items.order_id
       JOIN products ON products.id = order_items.product_id
       WHERE orders.season = ?
       GROUP BY products.id, products.name
       ORDER BY products.id`
    )
    .all(season);

  return rows.map((row) => ({
    product_id: row.product_id,
    name: row.name,
    total_500g: row.total_500g,
    total_kg: row.total_500g * 0.5,
  }));
}

module.exports = {
  createOrder,
  DuplicateOrderError,
  hasOrderForSeason,
  listOrders,
  updateOrderStatus,
  updateOrderPaymentState,
  getOrderById,
  getOrderItemsForEdit,
  applyOrderEdit,
  deleteOrder,
  deleteOrdersBySeason,
  getProductionTotals,
  ORDER_STATUSES,
  PAID_STATUSES,
};
