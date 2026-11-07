const PLACEHOLDER_PRODUCTS = [
  { id: 'blanc', name: 'Boudin blanc', price_per_kg: 1000 },
  { id: 'blanc_morue', name: 'Boudin blanc morue', price_per_kg: 1000 },
  { id: 'noir', name: 'Boudin noir', price_per_kg: 1000 },
];

// Prix placeholder (10,00 € / kg) et date placeholder : décisions en suspens
// (.ai/decisions.md), à remplacer avant la vraie saison. `order_deadline` n'est
// pas stocké ici : il est calculé à la demande par le service de dates (M3)
// à partir de `conception_date`, pour éviter toute désynchronisation si
// `conception_date` change après coup.
const PLACEHOLDER_SETTINGS = {
  season: '2026',
  conception_date: '2026-12-13',
};

function seed(db) {
  const insertProduct = db.prepare(
    'INSERT OR IGNORE INTO products (id, name, price_per_kg) VALUES (@id, @name, @price_per_kg)'
  );
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)'
  );

  const run = db.transaction(() => {
    for (const product of PLACEHOLDER_PRODUCTS) {
      insertProduct.run(product);
    }
    for (const [key, value] of Object.entries(PLACEHOLDER_SETTINGS)) {
      insertSetting.run({ key, value });
    }
  });

  run();
}

module.exports = { seed, PLACEHOLDER_PRODUCTS, PLACEHOLDER_SETTINGS };
