# Mapping — LaTradition (gestion des commandes de boudins)

> Cartographie fichiers/modules ↔ fonctionnalités, maintenue au fil du projet. Mise à jour à chaque Session-End si des fichiers sont créés/déplacés/renommés (autonome silencieux). Ne remplace pas le graphe généré par Graphify (`graphify-out/`), qui reste la source la plus fiable en cas de doute (relations EXTRACTED).

## Modules

### `backend/src/app.js`
- Rôle : construction de l'application Express (middlewares globaux, routes). Séparé de `server.js` pour être testable sans ouvrir de port réseau.
- Fichiers principaux : `backend/src/app.js`.
- Dépend de : `express`, `helmet`.
- Utilisé par : `backend/src/server.js`, `backend/tests/health.test.js`.

### `backend/src/server.js`
- Rôle : point d'entrée, démarre l'écoute HTTP sur `127.0.0.1` uniquement (CDC §9).
- Fichiers principaux : `backend/src/server.js`.
- Dépend de : `backend/src/app.js`, `dotenv`.
- Utilisé par : `npm start`.

### `backend/tests/`
- Rôle : tests d'intégration (vitest + supertest) sur l'app Express.
- Fichiers principaux : `backend/tests/health.test.js`.
- Dépend de : `backend/src/app.js`.
- Utilisé par : `npm test`.

### `backend/src/db/`
- Rôle : schéma SQLite, migrations, seed, accès bas niveau à la base.
- Fichiers principaux : `schema.js` (DDL des 5 tables), `connection.js` (ouverture/pragmas), `migrate.js` (idempotent), `seed.js` (valeurs placeholder), `setup.js` (CLI `npm run db:setup`).
- Dépend de : `better-sqlite3`.
- Utilisé par : `backend/tests/db.test.js` ; futurs `routes/` et `services/` (M3+).
- Note : `orders.UNIQUE(customer_id, season)` implémente la décision « dédoublonnage par téléphone » au niveau base de données.

### `backend/src/services/pricing.js`
- Rôle : construction des lignes de commande et calcul du total, en centimes entiers, prix figé au moment de l'appel.
- Fichiers principaux : `pricing.js`.
- Dépend de : aucune dépendance externe.
- Utilisé par : `backend/tests/pricing.test.js` ; futur `routes/orders.js` (M4).

### `backend/src/services/dates.js`
- Rôle : calcul de la date limite de commande (conception − 7 jours civils) et de l'état de verrouillage, en fuseau `Europe/Paris`.
- Fichiers principaux : `dates.js`.
- Dépend de : `luxon`.
- Utilisé par : `backend/tests/dates.test.js` ; futurs `routes/settings.js` et `routes/orders.js` (M4).

### `backend/src/services/nonce.js`
- Rôle : génération/vérification pure (sans accès DB) du nonce signé HMAC à usage unique.
- Fichiers principaux : `nonce.js`.
- Dépend de : `crypto` (Node natif).
- Utilisé par : `backend/src/db/nonceStore.js`, `backend/src/middleware/antiAbuseGuard.js`.

### `backend/src/db/nonceStore.js`
- Rôle : persistance de l'usage unique du nonce (table `used_nonces`), purge des entrées expirées.
- Fichiers principaux : `nonceStore.js`.
- Dépend de : `backend/src/db/schema.js` (table `used_nonces`), `backend/src/services/nonce.js`.
- Utilisé par : `backend/src/middleware/antiAbuseGuard.js`.

### `backend/src/middleware/antiAbuseGuard.js`
- Rôle : middleware Express combinant nonce anti-replay + honeypot + délai minimum de soumission (décision retenue, `.ai/decisions.md`).
- Fichiers principaux : `antiAbuseGuard.js`.
- Dépend de : `backend/src/services/nonce.js`, `backend/src/db/nonceStore.js`.
- Utilisé par : futur `routes/orders.js` (M4).

### `backend/src/db/productsRepo.js`, `settingsRepo.js`, `customersRepo.js`, `ordersRepo.js`
- Rôle : accès aux tables `products`/`settings`/`customers`/`orders`+`order_items`, réutilisables par les routes publiques (M4) et futures routes admin (M6/M8).
- Dépend de : `backend/src/db/schema.js`.
- Utilisé par : `backend/src/routes/{products,settings,orders,checkPhone}.js`.
- `products.price_per_kg` est la source de vérité depuis B0 (2026-11-07, `.ai/decisions.md`) ; le prix par 500g facturé est dérivé par calcul dans `services/pricing.js`, jamais stocké.
- `customersRepo.findCustomerByPhone` (lecture seule) et `ordersRepo.hasOrderForSeason` ajoutés en B3 pour `routes/checkPhone.js`.

### `backend/src/services/validation.js`
- Rôle : validation/normalisation nom/prénom/téléphone (formats FR national/+33 uniquement, hypothèse documentée dans le code).
- Utilisé par : `backend/src/routes/orders.js`.

### `backend/src/routes/products.js`, `settings.js`, `orders.js`, `checkPhone.js`
- Rôle : les 4 endpoints publics (`GET /api/products`, `GET /api/settings/public` — inclut `news`, `pickup_address`, `contact_phone`, `POST /api/check-phone`, `POST /api/orders`). `orders.js` orchestre anti-abus (M3bis) → verrouillage (M3) → validation → prix (M3) → persistance (db/). `checkPhone.js` (B3, 2026-11-07, `.ai/decisions.md`) vérifie le nonce (signature + TTL) sans le consommer, pour détecter un doublon téléphone/saison en live côté front sans bloquer la soumission finale.
- `pickup_address`/`contact_phone` (2026-11-07, suite à retour utilisateur sur le front) : même traitement que `news` (clé `settings` générique, chaîne vide par défaut, pas de migration de schéma) — lues par `GET /api/settings/public`, modifiables par `PUT /api/admin/settings`. Pas d'interface admin dédiée (comme `news`), modification possible uniquement via appel API direct en attendant le dashboard.
- Dépend de : tous les modules `db/` et `services/` ci-dessus, `middleware/antiAbuseGuard.js` (orders.js uniquement — checkPhone.js vérifie le nonce directement via `services/nonce.js`).
- Utilisé par : `backend/src/app.js`.

### `backend/src/services/adminAuth.js`
- Rôle : hash/vérification du mot de passe admin (bcryptjs) et génération/vérification de session JWT sans état serveur.
- Dépend de : `bcryptjs`, `jsonwebtoken`.
- Utilisé par : `backend/src/routes/admin/auth.js`, `backend/src/middleware/requireAdminAuth.js`.

### `backend/src/db/adminLoginAttemptsRepo.js`
- Rôle : compteur global (un seul compte admin partagé, voir `.ai/decisions.md`) de tentatives de connexion échouées et verrou temporaire anti brute-force.
- Dépend de : `backend/src/db/schema.js` (table `admin_login_attempts`).
- Utilisé par : `backend/src/routes/admin/auth.js`.

### `backend/src/middleware/requireAdminAuth.js`
- Rôle : middleware Express protégeant toutes les routes `/api/admin/*` sauf login/logout ; vérifie le cookie `admin_token`.
- Dépend de : `backend/src/services/adminAuth.js`.
- Utilisé par : `backend/src/app.js`.

### `backend/src/routes/admin/` (`auth.js`, `orders.js`, `production.js`, `export.js`, `products.js`, `settings.js`, `customers.js`)
- Rôle : les 9 endpoints admin (M5-M8) — login/logout, liste/statut des commandes, totaux de production, export xlsx/csv, modification prix produit, modification des paramètres de saison, anonymisation client.
- Dépend de : `backend/src/db/{ordersRepo,productsRepo,customersRepo,settingsRepo,adminLoginAttemptsRepo}.js`, `backend/src/services/{adminAuth,export,dates}.js`, `backend/src/middleware/requireAdminAuth.js`.
- Utilisé par : `backend/src/app.js`.

### `backend/src/services/export.js`
- Rôle : construction des lignes d'export (une ligne par produit commandé) et génération xlsx (`exceljs`)/CSV (`;`, BOM UTF-8) — CDC §6.5.
- Dépend de : `exceljs`.
- Utilisé par : `backend/src/routes/admin/export.js`.

### `backend/src/db/ordersRepo.js`, `productsRepo.js`, `customersRepo.js` (enrichis en M6/M8)
- Ajouts : `listOrders`/`updateOrderStatus`/`getProductionTotals` (ordersRepo), `updateProduct`/`getProductById` (productsRepo), `anonymizeCustomer` (customersRepo).

### `backend/src/middleware/corsGuard.js`
- Rôle : restriction CORS à une seule origine configurable (`ALLOWED_ORIGIN`), bloque par défaut si absente (CDC §9, décision M9).
- Utilisé par : `backend/src/app.js` (monté globalement, avant les routes).

### `backend/src/middleware/errorHandler.js`
- Rôle : gestionnaire d'erreurs Express centralisé, journalise sans jamais inclure `req.body`/`req.query` (PII potentielle), CDC §10.
- Utilisé par : `backend/src/app.js` (dernier middleware monté).

### `backend/scripts/backup.js`
- Rôle : sauvegarde quotidienne du fichier SQLite (`VACUUM INTO`, cohérente en WAL) + purge au-delà de `BACKUP_RETENTION_DAYS`. Script indépendant du code applicatif (CDC §10, M10).
- Dépend de : `better-sqlite3`.
- Utilisé par : `backend/deploy/boudins-backup.service` (timer systemd), exécutable aussi en manuel.

### `backend/deploy/` (`boudins-backend.service`, `boudins-backup.{service,timer}`)
- Rôle : exemples d'unités systemd pour le démarrage automatique du serveur et de la sauvegarde (Linux, confirmé pour la machine de production). Non testables automatiquement (documentation d'exploitation).

### `frontend/` (parcours client, F1-F7, 2026-11-07)
- Rôle : les 5 étapes du parcours client (Bienvenue → Commande → PII → Récap/Prix → Confirmation), vanilla JS sans outil de build (`.ai/decisions.md`).
- `index.html` : 5 `<section data-step>` jamais détruites/recréées ; seules `hidden` et leur contenu changent.
- `js/state.js` : état plat immuable (fonctions pures), source de vérité unique ; aucune dépendance au DOM, testé isolément.
- `js/api.js` : wrappers `fetch` (`products`, `settings/public`, `check-phone`, `orders`), `window.API_BASE` surchargeable pour un test local contre un backend sur une autre origine (vide par défaut = proxy Netlify même origine en prod).
- `js/draft.js` : persistance `localStorage` du brouillon (step + pii + items uniquement — jamais le nonce ni la liste produits, voir `.ai/decisions.md`).
- `js/app.js` : orchestrateur (navigation, re-render, appel `enter()` des étapes à chaque transition, nettoyage du brouillon uniquement après confirmation serveur réussie).
- `js/steps/{welcome,order,pii,recap,confirmation}.js` : un module par étape, chacun avec `init()` (DOM statique + listeners, une seule fois) et `render()` (mise à jour des parties dynamiques) ; `order.js`/`welcome.js`/`confirmation.js` ont aussi `enter()` (appels réseau/nettoyage déclenchés à l'arrivée sur l'étape).
- `css/styles.css` : thème clair unique, pas de dark mode (hors scope).
- Tests (`tests/`, vitest + jsdom, `npm test` dans `frontend/`) : logique pure (`state.test.js`, `draft.test.js`, `pii-validation.test.js`), wrappers API mockés (`api.test.js`), et un test d'intégration DOM (`app.test.js`) couvrant navigation avant/arrière (F1), avertissement de doublon non bloquant (F4), total serveur affiché + nettoyage du brouillon (F5/F6/F7). 27 tests verts.
- Vérifié manuellement en conditions réelles (backend réel sur `127.0.0.1:3101`, front servi statiquement) : parcours complet jusqu'à confirmation, et parcours avec téléphone en doublon (avertissement affiché, navigation non bloquée).
- Dépend de : les 4 endpoints publics du backend (`GET /api/products`, `GET /api/settings/public`, `POST /api/check-phone`, `POST /api/orders`).

> Socle d'authentification du dashboard admin : voir `frontend/admin/` ci-dessous. Contenu métier des vues (commandes, production, produits, paramètres, export, clients) toujours entièrement à faire (voir point de scope ouvert, `docs/plan-implementation-frontend.md` et `docs/plan-implementation-admin.md`).

### `frontend/admin/` (socle d'authentification, M-ADM1/M-ADM2, 2026-11-08)
- Rôle : point d'entrée `/admin` — login, détection de session, gestion globale de l'expiration de session (401). Ne couvre pas le contenu métier des vues (hors scope, voir `docs/plan-implementation-admin.md`).
- `index.html` : 3 `<section data-view>` (`loading`, `login`, `dashboard` — placeholder vide) jamais détruites/recréées ; seule `hidden` change (même pattern que `frontend/index.html`). Tous les chemins (CSS, JS, appels API) écrits en absolu depuis la racine du domaine (`/admin/...`, `/api/admin/...`), jamais en relatif — convention actée en Decision-Gel du 2026-11-08 pour neutraliser le risque propre à un sous-dossier.
- `js/adminState.js` : état plat `{ view, loginError }`, fonctions pures, aucune dépendance au DOM — même pattern que `../../js/state.js`.
- `js/adminApi.js` : `checkSession`/`login`/`logout`, et `adminFetch` (wrapper générique destiné aux futures vues métier) + `onUnauthorized(handler)` — enregistrement d'un callback unique appelé par `adminFetch` sur tout 401, pour que les futures vues n'aient rien à gérer elles-mêmes.
- `js/adminApp.js` : orchestrateur — détection de session au chargement (`loading` → `login`/`dashboard`), soumission login (401 → message, 429 → message dédié « trop de tentatives »), logout, et enregistrement du handler `onUnauthorized` (bascule vers `login` + « session expirée, reconnectez-vous » à tout moment, pas seulement au chargement).
- `css/admin.css` : feuille dédiée et minimale, indépendante de `frontend/css/styles.css`.
- Tests (`frontend/tests/{adminState,adminApi,adminApp}.test.js`) : 18 tests (état pur, wrappers API mockés incluant `adminFetch`/`onUnauthorized`, intégration DOM jsdom couvrant chargement/login/logout/expiration 401 en cours d'usage/convention de chemins absolus). 51 tests front verts au total.
- Dépend de : `GET /api/admin/session` (M-ADM1, backend), `POST /api/admin/{login,logout}` (M5, existants).
- M-ADM3 (vérification manuelle en conditions réelles) : pas encore exécutée, dépend du déblocage infra (502/CORS, voir État courant de `.ai/project-context.md`).

### `netlify.toml` (2026-11-07, `docs/plan-deploiement.md` mission D4)
- Rôle : publie `frontend/` comme site statique Netlify, redirige `/api/*` en proxy (status 200) vers l'URL Tailscale Funnel du backend — même origine côté navigateur, cohérent avec `frontend/js/api.js` (chemins relatifs par défaut).
- L'URL `<machine>.ts.net` reste un placeholder tant que la mission D1 (Tailscale Funnel sur la machine de production) n'est pas faite par l'utilisateur.

## Non couvert
> Zones volontairement absentes de ce mapping (fichiers générés, vendorisés, hors périmètre).
- `backend/data/` (fichier SQLite, exclu du dépôt Git).
- `backend/.env` (secrets, exclu du dépôt Git).
