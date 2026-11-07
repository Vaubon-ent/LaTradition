function getActiveProducts(db) {
  return db.prepare('SELECT id, name, price_per_kg FROM products WHERE active = 1 ORDER BY id').all();
}

function getActiveProductsById(db) {
  const rows = db
    .prepare('SELECT id, name, price_per_kg, active FROM products WHERE active = 1 ORDER BY id')
    .all();
  const map = {};
  for (const product of rows) {
    map[product.id] = product;
  }
  return map;
}

// Modifie le prix et/ou l'activation d'un produit (CDC §6.6). Ne touche
// jamais order_items : le prix par 500g y est figé au moment de la commande
// (services/pricing.js, dérivé de price_per_kg), donc une commande passée
// n'est jamais affectée.
function updateProduct(db, id, { price_per_kg, active }) {
  const result = db
    .prepare('UPDATE products SET price_per_kg = ?, active = ? WHERE id = ?')
    .run(price_per_kg, active ? 1 : 0, id);
  return result.changes > 0;
}

function getProductById(db, id) {
  return db.prepare('SELECT id, name, price_per_kg, active FROM products WHERE id = ?').get(id);
}

module.exports = { getActiveProducts, getActiveProductsById, updateProduct, getProductById };
