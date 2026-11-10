const COLUMNS = [
  { header: 'Date de commande', key: 'created_at' },
  { header: 'Nom', key: 'last_name' },
  { header: 'Prénom', key: 'first_name' },
  { header: 'Téléphone', key: 'phone' },
  { header: 'Produit', key: 'product_name' },
  { header: 'Quantité (unités 500 g)', key: 'quantity_500g' },
  { header: 'Quantité (g)', key: 'quantity_g' },
  { header: 'Total ligne (€)', key: 'line_total_euros' },
  { header: 'Payé', key: 'paid' },
  { header: 'Récupéré', key: 'picked_up' },
];

// Payé / Récupéré découplés (demande directe du 2026-11-10, .ai/decisions.md
// — revient sur l'Option A du 2026-11-08) : remplace l'ancienne colonne
// unique « Statut » (orders.status), qui ne serait plus jamais mise à jour
// par le dashboard depuis le découplage et deviendrait donc silencieusement
// fausse dans cet export réellement utilisé en production.
const PAID_STATUS_LABELS = { non: 'Non', en_attente: 'En attente', oui: 'Oui' };

// Une ligne par produit commandé (CDC §6.5 : "produit, quantité... total"),
// pas une ligne par commande — une commande à plusieurs produits donne
// plusieurs lignes d'export, toutes identifiables par le client+date.
function buildExportRows(db, season) {
  const rows = db
    .prepare(
      `SELECT orders.created_at, orders.paid_status, orders.picked_up,
              customers.first_name, customers.last_name, customers.phone,
              products.name AS product_name,
              order_items.quantity_500g, order_items.line_total_cents
       FROM order_items
       JOIN orders ON orders.id = order_items.order_id
       JOIN customers ON customers.id = orders.customer_id
       JOIN products ON products.id = order_items.product_id
       WHERE orders.season = ?
       ORDER BY orders.created_at, orders.id, order_items.id`
    )
    .all(season);

  return rows.map((row) => ({
    created_at: row.created_at,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    product_name: row.product_name,
    quantity_500g: row.quantity_500g,
    quantity_g: row.quantity_500g * 500,
    line_total_euros: row.line_total_cents / 100,
    paid: PAID_STATUS_LABELS[row.paid_status] ?? row.paid_status,
    picked_up: row.picked_up ? 'Oui' : 'Non',
  }));
}

function csvEscape(value) {
  const str = String(value);
  if (/[";\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Séparateur `;` et BOM UTF-8 (CDC §6.5), pour compatibilité Excel/Google
// Sheets qui, sans BOM, interprètent les accents en Latin-1.
function buildCsv(rows) {
  const header = COLUMNS.map((c) => csvEscape(c.header)).join(';');
  const lines = rows.map((row) => COLUMNS.map((c) => csvEscape(row[c.key])).join(';'));
  return '﻿' + [header, ...lines].join('\n') + '\n';
}

module.exports = { COLUMNS, buildExportRows, buildCsv };
