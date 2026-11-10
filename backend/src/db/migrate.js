const { SCHEMA_SQL } = require('./schema');

// Ajoute une colonne à une table existante si elle n'y est pas déjà — premier
// besoin de ce type sur ce projet (toutes les évolutions de schéma précédentes
// avaient eu lieu avant la mise en production, simple CREATE TABLE IF NOT
// EXISTS). Nécessaire car SQLite n'a pas d'équivalent "ADD COLUMN IF NOT
// EXISTS" natif. Renvoie true si la colonne vient d'être ajoutée (false si
// elle existait déjà) — utile pour ne déclencher un éventuel backfill de
// données qu'une seule fois, jamais à chaque démarrage du serveur.
function ensureColumn(db, table, columnName, columnDefSql) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (columns.includes(columnName)) {
    return false;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefSql}`);
  return true;
}

function migrate(db) {
  db.exec(SCHEMA_SQL);

  // Préférence libre par commande (demande directe du 2026-11-10, .ai/decisions.md).
  ensureColumn(
    db,
    'orders',
    'option',
    "option TEXT NOT NULL DEFAULT '' CHECK (option IN ('', 'plus_piment', 'moins_piment'))"
  );

  // Découplage Payé / Récupéré (demande directe du 2026-11-10, .ai/decisions.md
  // — revient sur l'Option A du 2026-11-08, qui mappait les deux sur
  // `orders.status`) : deux champs indépendants, plus aucun lien automatique.
  // `paid_status` a 3 états (une commande neuve est "en attente", jamais
  // directement "non" ou "oui" : décision explicite de l'utilisateur) ;
  // `picked_up` reste binaire.
  const addedPaidStatus = ensureColumn(
    db,
    'orders',
    'paid_status',
    "paid_status TEXT NOT NULL DEFAULT 'en_attente' CHECK (paid_status IN ('non', 'en_attente', 'oui'))"
  );
  const addedPickedUp = ensureColumn(
    db,
    'orders',
    'picked_up',
    'picked_up INTEGER NOT NULL DEFAULT 0 CHECK (picked_up IN (0, 1))'
  );
  // Backfill une seule fois (à l'ajout initial des colonnes, jamais ensuite —
  // sinon un redémarrage du serveur écraserait les choix faits entre-temps
  // par l'admin via la nouvelle UI). Correspondance approuvée explicitement
  // par l'utilisateur le 2026-11-10 : recue→(non, non), payee→(oui, non),
  // retiree→(oui, oui) — reflète ce que ces statuts signifiaient avant le
  // découplage (une commande "retirée" était jusqu'ici toujours payée).
  if (addedPaidStatus || addedPickedUp) {
    db.exec(`
      UPDATE orders SET
        paid_status = CASE status
          WHEN 'recue' THEN 'non'
          WHEN 'payee' THEN 'oui'
          WHEN 'retiree' THEN 'oui'
          ELSE paid_status
        END,
        picked_up = CASE WHEN status = 'retiree' THEN 1 ELSE picked_up END
    `);
  }
}

module.exports = { migrate };
