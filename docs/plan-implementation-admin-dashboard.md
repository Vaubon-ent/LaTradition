# Plan d'implémentation — Vue commandes du dashboard admin (`/admin`)

> Prérequis : `.ai/decisions.md` (section Retenues, entrées du 2026-11-08 sur la vue commandes), `docs/plan-implementation-admin.md` (socle d'authentification, déjà livré), `.ai/project-rules.md`.
> Palier de rigueur : **strict** → chaque mission ci-dessous inclut des tests couvrant les cas limites, pas seulement le chemin heureux.

## Scope

Remplace le placeholder (« À venir. ») de la vue `dashboard` par l'interface métier demandée : tableau des commandes filtrable colonne par colonne, export `.xlsx` sauvegardé côté serveur, boutons stub « Clôturer la campagne » / « Nouvelle campagne ». Ne couvre pas : production (déjà disponible via `GET /api/admin/production`, pas demandé ici), édition produits/paramètres, anonymisation client, second onglet de statistiques cross-saison (idée notée en suspens, `.ai/decisions.md`).

## Architecture concrète

### Backend — un seul nouvel endpoint, zéro nouvelle dépendance
- **`backend/src/services/export.js`** : ajout de `getExportsDir()` (par défaut `backend/data/exports/`, cohérent avec `backend/data/` déjà utilisé pour la DB et les sauvegardes, déjà dans `.gitignore`) et `saveXlsxExport(db, season, { exportsDir } = {})` — réutilise `buildExportRows`/`buildXlsxBuffer` existants (M7), crée le dossier si absent (`fs.mkdirSync(..., { recursive: true })`), écrit `commandes-{season}.xlsx` (écrase le fichier existant, décision retenue), retourne le chemin relatif écrit.
- **`backend/src/routes/admin/export.js`** : nouvelle route `POST /export/save` → `{ ok: true, path }`. Ajoute un paramètre `exportsDir` à `createAdminExportRouter({ db, exportsDir })` (optionnel, défaut = `getExportsDir()`) pour permettre son injection dans les tests sans écrire dans le vrai dossier `data/`.
- **`backend/src/app.js`** : aucun changement de montage (le routeur export est déjà monté sur `/api/admin`), juste la nouvelle route interne.
- **Pas de changement** sur `PATCH /api/admin/orders/:id/status` ni `GET /api/admin/orders` : la décision retenue (mapping payé/récupéré → `status` existant, Option A) ne nécessite aucune évolution backend, l'endpoint existant (M6) suffit déjà.

### Frontend — contenu de la vue `dashboard`
- **`frontend/admin/js/ordersData.js`** (nouveau, pur, sans DOM — testable isolément comme `frontend/js/state.js`) :
  - `PRODUCT_COLUMNS = [{ id: 'noir', label: 'Noir' }, { id: 'blanc', label: 'Blanc' }, { id: 'blanc_morue', label: 'Blanc morue' }]`
  - `kgForProduct(order, productId)` — somme `quantity_500g * 0.5` des lignes de l'commande correspondant à `productId`.
  - `isPaid(status)` → `status === 'payee' || status === 'retiree'` ; `isPickedUp(status)` → `status === 'retiree'`.
  - `statusAfterPaidToggle(currentStatus, checked)` et `statusAfterPickedUpToggle(currentStatus, checked)` — implémentent exactement la règle actée en Decision-Gel (cocher Récupéré → `retiree` ; décocher Récupéré depuis `retiree` → `payee` ; cocher/décocher Payé bascule `recue`/`payee`, no-op si `retiree` — la case Payé est désactivée côté vue dans ce cas).
  - `matchesFilters(order, filters)` — filtres texte simples par colonne (nom, prénom, téléphone, date formatée, kg formatés) + filtre à 3 valeurs (tous/oui/non) pour payé et récupéré.
- **`frontend/admin/js/ordersView.js`** (nouveau, DOM) :
  - `mount(root)` : fetch `GET /api/admin/orders` via `adminFetch` (ajout dans `adminApi.js`), construit le tableau (une ligne par commande, colonnes : nom, prénom, tél., kg noir, kg blanc, kg blanc morue, date de commande, payé, récupéré), une ligne de filtres juste sous l'en-tête.
  - Filtrage et tri réalisés en mémoire sur la liste déjà chargée (décision retenue : pas de nouveau paramètre serveur) — ré-affiche uniquement `<tbody>` à chaque frappe, pas de nouveau fetch.
  - Cases « Payé »/« Récupéré » : `change` → calcule le nouveau statut (`ordersData.js`) → `PATCH /api/admin/orders/:id/status` via `adminFetch` → met à jour la ligne localement en cas de succès, message d'erreur inline sinon (requête ne doit jamais bloquer le reste du tableau).
  - Bouton « Exporter (.xlsx) » → `POST /api/admin/export/save` via `adminFetch` → message de confirmation avec le chemin retourné, ou message d'erreur.
  - Boutons « Clôturer la campagne » / « Nouvelle campagne » → au clic, affichent un message statique (« Pas encore implémenté. ») — **aucun appel réseau**, décision retenue.
- **`frontend/admin/js/adminApi.js`** : ajout de `fetchOrders()`, `updateOrderStatus(id, status)`, `saveOrdersExport()` — même pattern `adminFetch` que l'existant.
- **`frontend/admin/js/adminApp.js`** : au passage en vue `dashboard` (chargement avec session valide, ou login réussi), appelle `ordersView.mount(dashboardContainer)`.
- **`frontend/admin/index.html`** : remplace le placeholder par le conteneur du tableau (laisse `ordersView.js` construire le DOM interne pour garder `index.html` simple, cohérent avec le peu de HTML statique déjà présent).
- **`frontend/admin/css/admin.css`** : styles tableau spacieux (cellules aérées, zébrage léger) + ligne de filtres + boutons d'action.

### Composants et dépendances
```
admin/index.html
 └─ adminApp.js
     └─ ordersView.js (mount au passage en vue dashboard)
         ├─ ordersData.js (pur : filtres, mapping payé/récupéré, transitions de statut)
         └─ adminApi.js (fetchOrders / updateOrderStatus / saveOrdersExport)
             ├─ GET  /api/admin/orders           (existant, M6)
             ├─ PATCH /api/admin/orders/:id/status (existant, M6)
             └─ POST /api/admin/export/save       (nouveau)
                 └─ services/export.js : saveXlsxExport() (nouveau, réutilise M7)
```

## Missions (priorisées)

### M-DASH1 (backend) — export sauvegardé sur disque
- Fichiers : `backend/src/services/export.js` (+`getExportsDir`, `saveXlsxExport`), `backend/src/routes/admin/export.js` (+`POST /export/save`), `backend/src/app.js` (injection `exportsDir` dans `createAdminExportRouter` si besoin de configuration via env — sinon défaut suffisant).
- Tests (`backend/tests/export.test.js`, `backend/tests/adminExport.test.js`) :
  - `saveXlsxExport` écrit un fichier lisible (relu avec exceljs, lignes correctes) dans un `exportsDir` de test (jamais le vrai `data/exports`).
  - Deuxième appel sur la même saison écrase le fichier (un seul fichier, pas d'accumulation).
  - `POST /api/admin/export/save` : 401 sans cookie ; 200 + `{ ok: true, path }` avec cookie valide ; fichier réellement présent sur disque après l'appel (dossier de test injecté).

### M-DASH2 (frontend, logique pure) — `ordersData.js`
- Tests (`frontend/tests/ordersData.test.js`) :
  - `kgForProduct` : commande avec/sans ligne pour un produit donné, plusieurs lignes du même produit (cas défensif).
  - `isPaid`/`isPickedUp` pour les 3 valeurs de statut.
  - `statusAfterPaidToggle`/`statusAfterPickedUpToggle` : toutes les transitions de la règle actée (y compris les cas no-op/désactivés).
  - `matchesFilters` : filtre texte (nom/prénom/téléphone partiel), filtre kg, filtre payé/récupéré (tous/oui/non), plusieurs filtres combinés.

### M-DASH3 (frontend, DOM) — `ordersView.js` + câblage
- Fichiers : `frontend/admin/js/ordersView.js`, `adminApi.js` (+3 fonctions), `adminApp.js` (appel `mount`), `index.html`, `css/admin.css`.
- Tests (`frontend/tests/ordersView.test.js`, intégration DOM jsdom, + extension `adminApi.test.js`) :
  - Montage initial : tableau rendu avec les commandes retournées par `GET /api/admin/orders` (mocké).
  - Taper dans un filtre colonne masque les lignes non correspondantes, sans nouvel appel réseau.
  - Cocher « Récupéré » déclenche `PATCH .../status` avec `retiree`, met à jour la ligne après succès ; échec serveur → message d'erreur, ligne inchangée.
  - Clic « Exporter (.xlsx) » déclenche `POST /api/admin/export/save`, affiche le chemin retourné.
  - Clic « Clôturer la campagne » / « Nouvelle campagne » : affiche le message stub, **aucun appel réseau** (assertion explicite qu'aucun fetch supplémentaire n'est fait).

### M-DASH4 (vérification manuelle en conditions réelles)
- Backend local avec quelques commandes de test (seed manuel), front servi statiquement : parcourir le tableau, filtrer sur plusieurs colonnes, cocher/décocher payé et récupéré et vérifier la cohérence des transitions, exporter et vérifier le fichier réellement écrit sur disque (`backend/data/exports/commandes-{season}.xlsx`, relu pour vérifier son contenu), cliquer les deux boutons stub et vérifier qu'aucune requête réseau n'est émise (onglet réseau du navigateur).
- Base de test et fichiers d'export de test supprimés après vérification (aucune donnée réelle utilisée).

## Vérification des décisions en suspens
Aucune décision en suspens actuelle ne bloque ce plan. L'idée notée en suspens le 2026-11-08 (xlsx vs csv pour un futur onglet stats cross-saison) ne concerne pas ce plan — elle ne sera tranchée que lorsque cette fonctionnalité sera elle-même cadrée.

## Prêt pour `/implementation`
M-DASH1 → M-DASH2 → M-DASH3 → M-DASH4, dans cet ordre (M-DASH1 et M-DASH2 sont indépendants entre eux et peuvent être menés en parallèle si besoin).
