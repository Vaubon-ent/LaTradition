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

module.exports = {
  OrderValidationError,
  computeLineTotalCents,
  buildOrderItems,
  computeOrderTotalCents,
};
