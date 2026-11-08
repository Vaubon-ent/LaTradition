class OrderValidationError extends Error {}

function computeLineTotalCents(quantity500g, unitPriceCents) {
  return quantity500g * unitPriceCents;
}

// requestedItems: [{ product_id, quantity_500g }]
// productsById: { [product_id]: { price_per_kg, active, ... } }
// price_per_kg est la source de vérité (.ai/decisions.md 2026-11-07) ; le prix par
// 500g utilisé pour la facturation est dérivé ici par division (arrondi au centime
// le plus proche, arrondi au supérieur pour une moitié de centime — comportement de
// Math.round), puis copié dans la ligne (figé), jamais référencé dynamiquement
// depuis `productsById`, pour qu'une modification ultérieure du prix du produit
// n'affecte jamais une commande déjà construite.
function buildOrderItems(requestedItems, productsById) {
  const lines = [];

  for (const item of requestedItems) {
    const quantity500g = item.quantity_500g;
    if (!quantity500g || quantity500g <= 0) {
      continue;
    }

    const product = productsById[item.product_id];
    if (!product) {
      throw new OrderValidationError(`Produit inconnu : ${item.product_id}`);
    }
    if (!product.active) {
      throw new OrderValidationError(`Produit indisponible : ${item.product_id}`);
    }

    const unitPriceCents = Math.round(product.price_per_kg / 2);
    lines.push({
      product_id: item.product_id,
      quantity_500g: quantity500g,
      unit_price_cents: unitPriceCents,
      line_total_cents: computeLineTotalCents(quantity500g, unitPriceCents),
    });
  }

  if (lines.length === 0) {
    throw new OrderValidationError(
      'Au moins un produit doit avoir une quantité supérieure à 0.'
    );
  }

  return lines;
}

function computeOrderTotalCents(lines) {
  return lines.reduce((sum, line) => sum + line.line_total_cents, 0);
}

// Diff pur (sans DB) entre les lignes existantes d'une commande et les
// quantités demandées par l'admin (M-DASH5, édition client/commande) :
// - une ligne déjà présente ne change que de quantité, son unit_price_cents
//   figé est conservé (décision retenue du 2026-11-08, pas de renégociation
//   de prix sur une correction de quantité) ;
// - une ligne absente de la demande (ou ramenée à 0) est supprimée ;
// - un nouveau produit ajouté à la commande est traité comme une nouvelle
//   ligne : son prix est dérivé de price_per_kg au moment de l'édition
//   (comme buildOrderItems le ferait pour une commande neuve), car il n'a
//   jamais eu de prix figé à préserver.
// existingItems: [{ id, product_id, quantity_500g, unit_price_cents }]
// requestedItems: [{ product_id, quantity_500g }]
// productsById: produits actifs (pour la validation/le prix des nouvelles lignes)
function buildUpdatedOrderItems(existingItems, requestedItems, productsById) {
  const requestedByProduct = new Map();
  for (const item of requestedItems) {
    const quantity500g = item.quantity_500g;
    if (!quantity500g || quantity500g <= 0) continue;
    requestedByProduct.set(item.product_id, quantity500g);
  }

  const updates = [];
  const deleteIds = [];

  for (const existing of existingItems) {
    const quantity500g = requestedByProduct.get(existing.product_id);
    if (quantity500g === undefined) {
      deleteIds.push(existing.id);
      continue;
    }
    updates.push({
      id: existing.id,
      quantity_500g: quantity500g,
      line_total_cents: computeLineTotalCents(quantity500g, existing.unit_price_cents),
    });
    requestedByProduct.delete(existing.product_id);
  }

  const inserts = [];
  for (const [productId, quantity500g] of requestedByProduct) {
    const product = productsById[productId];
    if (!product) {
      throw new OrderValidationError(`Produit inconnu : ${productId}`);
    }
    if (!product.active) {
      throw new OrderValidationError(`Produit indisponible : ${productId}`);
    }
    const unitPriceCents = Math.round(product.price_per_kg / 2);
    inserts.push({
      product_id: productId,
      quantity_500g: quantity500g,
      unit_price_cents: unitPriceCents,
      line_total_cents: computeLineTotalCents(quantity500g, unitPriceCents),
    });
  }

  if (updates.length + inserts.length === 0) {
    throw new OrderValidationError('Au moins un produit doit avoir une quantité supérieure à 0.');
  }

  const totalCents = computeOrderTotalCents([...updates, ...inserts]);

  return { inserts, updates, deleteIds, totalCents };
}

module.exports = {
  OrderValidationError,
  computeLineTotalCents,
  buildOrderItems,
  computeOrderTotalCents,
  buildUpdatedOrderItems,
};
