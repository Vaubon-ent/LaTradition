const PLACEHOLDER_PRODUCTS = [
  { id: 'blanc', name: 'Boudin blanc', price_per_kg: 1000 },
  { id: 'blanc_morue', name: 'Boudin blanc morue', price_per_kg: 1000 },
  { id: 'noir', name: 'Boudin noir', price_per_kg: 1000 },
];

// Prix placeholder (10,00 € / kg) et dates placeholder : décisions en suspens
// (.ai/decisions.md), à remplacer avant la vraie saison. `conception_date` et
// `order_deadline` sont toutes les deux saisies manuellement par l'admin,
// indépendamment l'une de l'autre (demande explicite du 2026-11-10 — revient
// sur M3, qui calculait order_deadline = conception_date - 7 jours).
const PLACEHOLDER_SETTINGS = {
  season: '2026',
  conception_date: '2026-12-13',
  order_deadline: '2026-12-06',
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
