# Change log — LaTradition (gestion des commandes de boudins)

> Journal technique append-only : modifications de code, bugs, correctifs, changements d'architecture. Ne jamais réécrire une entrée existante.

## 2026-11-07 — Adoption du framework .ai/
- Projet au stade cahier des charges (`docs/cahier-des-charges.md`), aucun code écrit.
- Palier de rigueur retenu : strict.
- Stack technique figée dans `project-rules.md` : Node.js/Express, SQLite, vanilla JS, Netlify + Tailscale Funnel.
- Cadrage figé dans `project-context.md`.

## 2026-11-07 — M1 : squelette backend
- Création de `backend/` : `package.json` (Express, helmet, dotenv, better-sqlite3 ; vitest + supertest en dev), `.gitignore` (`node_modules/`, `data/`, `.env`), `.env.example`.
- `src/app.js` (app Express avec helmet, JSON body parser, `GET /api/health`) séparé de `src/server.js` (écoute `127.0.0.1` uniquement) pour permettre les tests d'intégration sans ouvrir de port.
- Test d'intégration `tests/health.test.js` (vitest + supertest), vert.
- `npm install` initial a révélé 6 vulnérabilités (dont 2 critiques) via la chaîne de dépendances de vitest@2 ; résolu en montant vitest à `^5.1.0` → 0 vulnérabilité.
- Vérifié manuellement : démarrage du serveur et réponse de `GET /api/health` en conditions réelles.

## 2026-11-07 — M2 : schéma SQLite, migrations, seed
- `src/db/schema.js` : 5 tables (`products`, `settings`, `customers`, `orders`, `order_items`) conformes à CDC §7.1, avec contraintes CHECK (montants ≥ 0, `quantity_500g ≥ 1`, `status` restreint, booléens 0/1).
- Choix de modélisation : `customers.phone` est `UNIQUE` globalement (le client est conservé d'une saison à l'autre, CDC §7.3/objectif 5) ; `orders` porte `UNIQUE (customer_id, season)`, ce qui implémente directement au niveau base de données la décision retenue « dédoublonnage par téléphone » (`.ai/decisions.md`) — une 2e commande du même client sur la même saison est rejetée par la contrainte elle-même.
- `src/db/connection.js` (ouverture SQLite, WAL + foreign_keys ON, création du dossier `data/` si absent), `src/db/migrate.js` (idempotent, `CREATE TABLE IF NOT EXISTS`), `src/db/seed.js` (produits et réglages placeholder — prix et date de conception sont des décisions en suspens, voir `.ai/decisions.md`), `src/db/setup.js` (script CLI, `npm run db:setup`).
- `order_deadline` n'est volontairement pas stocké : calcul délégué au service de dates (M3), pour éviter une désynchronisation si `conception_date` change après coup.
- Tests (`tests/db.test.js`) : création des tables, idempotence des migrations et du seed, contraintes (id/téléphone dupliqué, prix négatif, quantité à 0, statut invalide, total négatif, doublon client+saison rejeté, saisons différentes autorisées). 13 tests verts au total.
- Vérifié manuellement : `npm run db:setup` sur fichier réel (`data/boudins.db`), lecture des données seedées.

## 2026-11-07 — M3 : services métier (prix, dates)
- `src/services/pricing.js` : `buildOrderItems()` construit les lignes de commande en centimes entiers, ignore les lignes à quantité 0, rejette (via `OrderValidationError`) une commande sans aucune ligne positive, un produit inconnu ou désactivé. Le prix unitaire est copié dans la ligne au moment de l'appel (jamais référencé en direct depuis l'objet produit), pour garantir qu'une commande déjà construite ne soit jamais affectée par un changement de prix ultérieur.
- `src/services/dates.js` : ajout de la dépendance `luxon` (calcul calendaire fiable en fuseau `Europe/Paris`, notamment lors des changements d'heure DST — jugé trop risqué à réimplémenter à la main pour le palier strict). `getOrderDeadlineDate()` = date de conception − 7 jours civils ; `isOrderLocked()` compare à 23:59:59.999 (Europe/Paris) du jour limite.
- Tests (`tests/pricing.test.js`, `tests/dates.test.js`) : cas limites quantités à 0, produit inconnu/désactivé, prix figé après modification du produit, calcul de date limite traversant le changement d'heure du 29 mars 2026, bornes exactes de verrouillage (dernière seconde autorisée / 1 ms après). 27 tests verts au total (suite complète).

## 2026-11-07 — M3bis : nonce anti-replay + honeypot/délai
- Correction de cohérence apportée à `.ai/decisions.md` : le nonce est émis avant la saisie des informations client (`GET /api/settings/public`), il ne peut donc pas être dérivé de PII comme le texte initial le laissait entendre — précisé sans remettre en cause le principe retenu (nonce signé à usage unique). Le délai minimum anti-bot s'appuie sur l'horodatage **signé** du nonce plutôt que sur un horodatage envoyé par le client, pour ne pas être falsifiable.
- `src/services/nonce.js` : `generateNonce`/`verifyNonce`, nonce = identifiant aléatoire + horodatages signés HMAC-SHA256 (comparaison de signature en temps constant via `crypto.timingSafeEqual`).
- `src/db/schema.js` : ajout de la table `used_nonces (id, expires_at)`. `src/db/nonceStore.js` : `consumeNonce` (détection d'usage unique via contrainte PK), `purgeExpiredNonces` (état borné par le TTL).
- `src/middleware/antiAbuseGuard.js` : combine vérification + consommation du nonce, honeypot (champ `website` cohérent avec le formulaire client), délai minimum (3 s par défaut) — les trois mécanismes de la décision retenue, en un seul middleware prêt à être branché sur `POST /api/orders` (M4).
- Tests (`tests/nonce.test.js`, `tests/nonceStore.test.js`, `tests/antiAbuseGuard.test.js`) : signature altérée/mauvais secret/expiré/malformé rejetés, nonce accepté à la dernière ms du TTL, réutilisation rejetée, honeypot rempli rejeté, soumission trop rapide rejetée, requête valide acceptée. 42 tests verts au total (suite complète).

## 2026-11-07 — M4 : endpoints publics
- `src/db/productsRepo.js`, `src/db/settingsRepo.js`, `src/db/customersRepo.js` (réutilise le client existant par téléphone, conforme à l'objectif 5 de conservation entre saisons), `src/db/ordersRepo.js` (transaction, traduit la violation de `UNIQUE (customer_id, season)` en `DuplicateOrderError` lisible).
- `src/services/validation.js` : validation nom/prénom/téléphone. Hypothèse simplificatrice documentée dans le code : seuls les formats téléphone français national et international (+33) sont acceptés et normalisés vers la forme nationale (nécessaire pour que le dédoublonnage par téléphone identifie le même client quel que soit le format saisi).
- `src/routes/products.js` (`GET /api/products`), `src/routes/settings.js` (`GET /api/settings/public`, émet le nonce de la décision retenue), `src/routes/orders.js` (`POST /api/orders`, chaîne : anti-abus → vérification de verrouillage → validation → calcul de prix → dédoublonnage/création).
- `src/app.js`/`src/server.js` mis à jour pour construire l'app avec `db`/`nonceSecret`/`minDelayMs` et exécuter les migrations au démarrage.
- Bug trouvé et corrigé en cours de route : `getActiveProductsById` ne sélectionnait pas la colonne `active`, ce qui faisait rejeter à tort tout produit comme « indisponible » lors de la construction d'une commande — corrigé par un `SELECT` incluant `active`.
- Tests d'intégration (`tests/products.test.js`, `tests/settings.test.js`, `tests/orders.test.js`, + helper `tests/helpers/testApp.js`) : chemin heureux, validation échouée, commande après verrouillage, nonce absent/invalide/réutilisé, doublon téléphone+saison rejeté (409), prix figé après modification du produit. 55 tests verts au total (suite complète).
- Vérifié manuellement en conditions réelles : serveur réel, `GET /api/products`, `GET /api/settings/public`, puis `POST /api/orders` après avoir réellement attendu le délai anti-bot de 3 s — commande créée, total serveur correct.

## 2026-11-07 — M5 : auth admin
- Décisions validées par l'utilisateur avant implémentation (sécurité/authentification → validation obligatoire) : compte admin unique partagé, hash bcryptjs, session JWT sans état serveur, verrou global anti brute-force. Détail et justification dans `.ai/decisions.md`.
- Dépendances ajoutées : `bcryptjs`, `jsonwebtoken`, `cookie-parser`.
- `src/services/adminAuth.js` : `verifyPassword` (bcryptjs), `generateToken`/`verifyToken` (JWT HMAC), erreur dédiée `AdminAuthError`.
- `src/db/schema.js` : table `admin_login_attempts` (ligne unique id=1 : compteur global d'échecs + horodatage de fin de verrou).
- `src/db/adminLoginAttemptsRepo.js` : `getState`, `isLocked`, `recordFailure`, `reset`.
- `src/middleware/requireAdminAuth.js` : vérifie le cookie `admin_token`, attache `req.admin`, 401 sinon.
- `src/routes/admin/auth.js` : `POST /api/admin/login` (429 si verrouillé, 401 si mot de passe incorrect, pose un cookie httpOnly sinon), `POST /api/admin/logout` (efface le cookie, accessible sans auth pour rester idempotent).
- `src/app.js`/`src/server.js` : montage de `/api/admin` (auth publique puis middleware `requireAdminAuth` pour le reste), nouvelles variables d'env `ADMIN_PASSWORD_HASH`/`ADMIN_JWT_SECRET` requises au démarrage.
- Tests (`adminAuth.test.js`, `adminLoginAttemptsRepo.test.js`, `adminAuth.integration.test.js`) : hash correct/incorrect, token valide/mauvais secret/expiré/malformé, verrouillage après N échecs et son expiration, accès refusé sans cookie, token expiré rejeté, logout empêche l'accès ultérieur. 72 tests verts au total (suite complète à ce stade).
- Vérifié manuellement en conditions réelles : serveur réel, mauvais mot de passe rejeté (401), bon mot de passe accepté avec cookie posé, route admin protégée refusée sans cookie puis acceptée avec.

## 2026-11-07 — M6 : endpoints admin commandes et production
- `src/db/ordersRepo.js` : `listOrders` (filtres statut/saison/recherche nom-téléphone, lignes de produits incluses), `updateOrderStatus`, `getProductionTotals` (totaux par produit en kg, sur toute la saison car aucune commande n'est jamais annulée — CDC §5.4).
- `src/routes/admin/orders.js` : `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status`.
- `src/routes/admin/production.js` : `GET /api/admin/production`.
- Tests (`adminOrders.test.js`) : accès refusé sans auth, filtres statut/recherche, statut invalide rejeté, commande inexistante → 404, totaux de production exacts en kg. 11 tests verts.

## 2026-11-07 — M7 : export xlsx/csv
- Dépendance ajoutée : `exceljs`. Vulnérabilité modérée connue et non résolue dans sa chaîne de dépendances (`uuid@8.3.2`, pas de version plus récente d'`exceljs` qui la corrige sans breaking change) — signalée, pas de correctif disponible sans régresser `exceljs` en 3.x ; risque jugé faible car la faille ne s'exploite que via un buffer attaquant passé directement à `uuid`, ce qu'on ne fait jamais.
- `src/services/export.js` : `buildExportRows` (une ligne par produit commandé, conversion g/kg et centimes/euros), `buildXlsxBuffer` (exceljs), `buildCsv` (séparateur `;`, BOM UTF-8, échappement des guillemets/points-virgules — CDC §6.5).
- `src/routes/admin/export.js` : `GET /api/admin/export.xlsx`, `GET /api/admin/export.csv`.
- Tests (`export.test.js`, `adminExport.test.js`) : lignes générées correctes, saison sans commande, BOM/séparateur CSV, échappement CSV, classeur xlsx relu et vérifié (en-têtes + données), accès refusé sans auth. 9 tests verts.
- Vérifié manuellement en conditions réelles : serveur réel, cycle commande → `GET /api/admin/orders` → `GET /api/admin/production` → `GET /api/admin/export.csv`, contenu cohérent de bout en bout.

## 2026-11-07 — M8 : paramètres admin et anonymisation
- Décision d'anonymisation validée par l'utilisateur avant implémentation (touche la décision en suspens sur la durée de conservation → validation obligatoire) : déclenchement manuel uniquement, remplacement du téléphone par un hash local (pas de dépendance externe). Détail dans `.ai/decisions.md`.
- `src/db/productsRepo.js` : `updateProduct`, `getProductById`.
- `src/db/customersRepo.js` : `anonymizeCustomer` (remplace nom/prénom/téléphone, laisse `orders`/`order_items` intacts).
- `src/routes/admin/products.js` : `PUT /api/admin/products/:id` (validation prix entier ≥ 0, `active` booléen, 404 si produit inconnu).
- `src/routes/admin/settings.js` : `PUT /api/admin/settings` (validation `conception_date` via `services/dates.js`, `season` non vide ; `order_deadline` n'étant jamais stocké, M3, il se recalcule automatiquement).
- `src/routes/admin/customers.js` : `POST /api/admin/customers/:id/anonymize`.
- Tests (`adminProducts.test.js`, `adminSettings.test.js`) : modification de prix sans impact sur une commande déjà passée, prix invalide rejeté, produit inconnu → 404, date de conception invalide rejetée, recalcul de la date limite publique après modification, saison vide rejetée, anonymisation remplace bien les PII sans toucher au total de la commande, client inconnu → 404, accès refusé sans auth sur toutes les routes. 12 tests verts.
- Point relevé en fin de session M5-M8 : `src/server.js` ne transmettait pas `minDelayMs` à `createApp`. Vérifié lors de la session M9/M10 : **ce n'était pas un bug** — la chaîne de paramètres par défaut (`createApp` → `createOrdersRouter` → `createAntiAbuseGuard`) retombe correctement sur `DEFAULT_MIN_DELAY_MS` (3000 ms) quand la valeur est `undefined`. Rendu explicite via `MIN_DELAY_MS` dans `.env` à l'occasion de M9, mais sans changement de comportement réel.
- Suite complète après M5-M8 : 104 tests verts (18 fichiers).

## 2026-11-07 — M9 : sécurité transverse
- Décisions validées par l'utilisateur avant implémentation : production confirmée sous Linux (pour M10), politique CORS « bloquer par défaut » tant que `ALLOWED_ORIGIN` n'est pas configuré (plus sûr que d'autoriser largement avant le déploiement Netlify réel).
- `src/middleware/corsGuard.js` : restriction CORS à une seule origine configurable, écrite à la main (pas de dépendance `cors`, cohérent avec le style du projet) — refuse 403 toute requête porteuse d'un `Origin` non autorisé ou si `ALLOWED_ORIGIN` est absent ; laisse passer les requêtes sans `Origin` (CORS est une politique navigateur, pas une authentification) ; gère le préflight `OPTIONS`.
- `src/middleware/errorHandler.js` : gestionnaire d'erreurs centralisé, journalise méthode/route/message (jamais `req.body`/`req.query`, qui peuvent contenir des PII), pile masquée en production.
- `src/routes/admin/auth.js` : logs `console.warn` sur échec de connexion et verrouillage, sans jamais journaliser le mot de passe reçu.
- Vérifié (déjà vrai structurellement, pas de changement de code) : aucune route n'utilise nom/téléphone comme segment d'URL — toujours un id numérique opaque.
- `src/app.js`/`src/server.js` : nouvelle variable d'env `ALLOWED_ORIGIN` (avertissement au démarrage si absente), `MIN_DELAY_MS` rendue explicite (voir point ci-dessus).
- Tests (`cors.test.js`, `security.test.js`, `errorHandler.test.js`) : origine autorisée/refusée/absente, blocage par défaut sans `ALLOWED_ORIGIN`, préflight `OPTIONS`, en-têtes helmet présents, non-fuite de PII dans les logs d'erreur. 10 tests verts.
- Vérifié manuellement en conditions réelles : serveur réel avec `ALLOWED_ORIGIN` configuré — requête avec la bonne origine acceptée (200 + en-têtes CORS), mauvaise origine refusée (403), requête directe sans `Origin` acceptée.

## 2026-11-07 — M10 : exploitation
- `backend/scripts/backup.js` : sauvegarde du fichier SQLite via `VACUUM INTO` (cohérente même en écriture concurrente WAL, contrairement à une copie de fichier directe), purge configurable des sauvegardes au-delà de `BACKUP_RETENTION_DAYS` (30 par défaut) pour ne pas remplir le disque sur une saison de plusieurs mois.
- `backend/deploy/boudins-backend.service`, `boudins-backup.{service,timer}` : exemples d'unités systemd pour le démarrage automatique du serveur et la sauvegarde quotidienne — **Linux confirmé par l'utilisateur** comme OS de la machine de production.
- `backend/README.md` : documentation complète (installation, variables d'env, sécurité transverse M9, sauvegarde, démarrage automatique, mises à jour avant saison).
- Tests (`backup.test.js`) : copie cohérente et complète, échec clair si fichier source absent, purge des sauvegardes anciennes en conservant les récentes, fichiers hors motif ignorés par la purge. 4 tests verts.
- Vérifié manuellement en conditions réelles : script lancé contre un vrai fichier SQLite migré/seedé, sauvegarde relue et données vérifiées identiques.
- Suite complète après M9-M10 : **118 tests verts (22 fichiers)**. Priorité 1, 2 et 3 du plan d'implémentation backend (`docs/plan-implementation-backend.md`) sont maintenant toutes couvertes par du code et des tests ; il ne reste que le `frontend/` et le déploiement réel.

## 2026-11-07 — B0 : migration du modèle de prix vers `price_per_kg` (`docs/plan-implementation-frontend.md`)
- Contexte : lors de la Planification du front, vérification du code réel a révélé une contradiction avec une décision gelée (« prix exposé en kg, déjà géré côté back ») — le back ne stockait en réalité que `price_per_500g`. L'utilisateur a tranché : `price_per_kg` devient la source de vérité (admin saisit un prix au kg). Détail dans `.ai/decisions.md`.
- `src/db/schema.js` : colonne `products.price_per_500g` renommée en `products.price_per_kg`.
- `src/db/productsRepo.js` : `getActiveProducts`, `getActiveProductsById`, `updateProduct`, `getProductById` utilisent `price_per_kg`.
- `src/db/seed.js` : placeholders exprimés en prix/kg (10,00 €/kg, économiquement identique aux anciens placeholders 5,00 €/500g).
- `src/routes/admin/products.js` (`PUT /api/admin/products/:id`) : accepte `price_per_kg` en entrée, même validation (entier ≥ 0).
- `src/services/pricing.js` (`buildOrderItems`) : le prix unitaire par 500g utilisé pour la facturation (`order_items`) est désormais **dérivé par calcul** (`Math.round(price_per_kg / 2)`) au moment de la construction de la commande, puis figé dans la ligne comme avant — aucune commande déjà passée n'est affectée par un changement de prix ultérieur (comportement inchangé).
- Tests adaptés (`adminProducts.test.js`, `db.test.js`, `orders.test.js`, `pricing.test.js`, `products.test.js`) + nouveau cas limite : prix au kg impair en centimes (1001 ¢) → arrondi déterministe du prix par 500g dérivé (`Math.round(1001/2) = 501`), vérifié sur une ligne de commande. 119 tests verts (22 fichiers, +1 par rapport à M9-M10).
- Suite complète relancée après migration : verte.
- `docs/cahier-des-charges.md` mis à jour en cohérence (§3, §6.6, §7.1, §8.2, §12) : prix au kg comme source de vérité, document de référence qui ne doit pas rester désynchronisé du code réel.

## 2026-11-07 — B1-B2-B3 : extensions backend pour le parcours client front (`docs/plan-implementation-frontend.md`)
- **B1** : `GET /api/products` expose directement `price_per_kg` (plus besoin de champ calculé séparé, c'est la valeur stockée depuis B0). Aucun changement de code au-delà de B0 ; vérifié par les tests `products.test.js` déjà adaptés.
- **B2** : `src/routes/settings.js` (`GET /api/settings/public`) et `src/routes/admin/settings.js` (`PUT /api/admin/settings`) étendus avec le champ `news` (texte libre, chaîne vide par défaut/autorisée) — simple extension de la table `settings` existante (clé/valeur générique), aucune migration de schéma nécessaire. Tests ajoutés (`settings.test.js`, `adminSettings.test.js`) : lecture par défaut vide, lecture après écriture, écriture d'une chaîne vide, rejet si non-chaîne.
- **B3** : nouvel endpoint public `POST /api/check-phone` (`src/routes/checkPhone.js`), monté dans `src/app.js`. Vérifie la signature + le TTL du nonce **sans le consommer** (`services/nonce.js` directement, pas `antiAbuseGuard`/`nonceStore`) pour qu'il reste utilisable par la vraie soumission `POST /api/orders` juste après. Ajouts : `customersRepo.findCustomerByPhone` (lecture seule, ne crée jamais de client) et `ordersRepo.hasOrderForSeason`. Réutilise `services/validation.normalizePhone` pour que le format saisi (national ou +33) ne fausse pas la détection. Tests (`checkPhone.test.js`) : téléphone inconnu, client connu sans commande cette saison, client connu avec commande cette saison, même téléphone sous deux formats, téléphone invalide, nonce absent/invalide, et surtout **non-consommation du nonce vérifiée** (un check-phone suivi d'une vraie commande avec le même nonce réussit).
- Suite complète après B0-B1-B2-B3 : **131 tests verts (23 fichiers)**.

## 2026-11-07 — F1-F7 : parcours client front (`docs/plan-implementation-frontend.md`)
- `frontend/` créé de toutes pièces : `index.html` (5 `<section data-step>` jamais détruites), `css/styles.css`, `js/{state,api,draft,app}.js`, `js/steps/{welcome,order,pii,recap,confirmation}.js`. Vanilla JS, aucun outil de build (`.ai/decisions.md`). Détail des rôles dans `.ai/mapping.md`.
- **F1** : navigation Suivant/Précédent + indicateur « Étape X/5 », état centralisé dans `state.js` (fonctions pures), sections jamais recréées donc les champs saisis survivent nativement à la navigation (pas de resynchronisation nécessaire au-delà du chargement initial/restauration de brouillon).
- **F2** : `news` récupéré via `GET /api/settings/public` à l'arrivée sur l'étape Bienvenue ; le nonce de cette réponse est explicitement ignoré (jamais stocké) — un nonce frais est récupéré à l'étape Commande.
- **F3** : nonce + `GET /api/products` récupérés à l'arrivée sur l'étape Commande ; une card par produit avec stepper +/- par pas de 0,5 kg (`state.roundToStep`, jamais négatif) ; bouton Suivant désactivé tant qu'aucune quantité > 0 (`hasAnyQuantity`).
- **F4** : formulaire PII avec validation de confort côté front (non vide + format téléphone FR), appel `POST /api/check-phone` au clic Suivant — avertissement non bloquant si doublon détecté, navigation jamais bloquée même si l'appel échoue (réseau ou serveur).
- **F5** : récapitulatif des lignes sans aucun calcul de total côté front ; `POST /api/orders` envoyé uniquement au clic « Valider la commande » ; en cas d'erreur serveur (validation, nonce expiré, doublon, config manquante), message affiché et saisie entièrement conservée pour permettre une correction.
- **F6** : étape Confirmation n'affiche que le résultat renvoyé par le serveur (`total_cents`, `conception_date`) ; lien de paiement en ligne affiché comme placeholder texte (« disponible prochainement »), aucune intégration Stripe.
- **F7** : brouillon `localStorage` (`boudins_draft_v1`) limité à `{ step, pii, items }` — jamais le nonce (usage unique, TTL 30 min) ni la liste produits (re-récupérée à chaque arrivée à l'étape Commande) ; nettoyage uniquement après confirmation serveur réussie (jamais avant, y compris en cas d'échec de soumission).
- Tests : `frontend/package.json` + `vitest.config.js` (environnement jsdom) ajoutés spécifiquement pour les tests (pas pour le build de l'app, conforme à la décision « pas d'outil de build/framework », `.ai/decisions.md`). 27 tests verts (`state.test.js`, `draft.test.js`, `pii-validation.test.js`, `api.test.js`, `app.test.js` — ce dernier simule le DOM complet et couvre la navigation avec rétention de saisie, l'avertissement de doublon non bloquant, et le nettoyage du brouillon conditionné à la confirmation serveur).
- Vérification manuelle en conditions réelles (backend réel en local, `MIN_DELAY_MS=0` et base de dev recréée pour la migration `price_per_kg`, front servi statiquement) : parcours complet jusqu'à confirmation (total et date de retrait affichés = réponse serveur), et parcours avec un numéro de téléphone déjà utilisé cette saison (avertissement affiché à l'étape PII, navigation non bloquée). Base de dev et `.env` de test supprimés après vérification (aucun secret réel utilisé).
- Suite complète backend après cette session : toujours 131 tests verts (aucune régression, travail purement front).

## 2026-11-07 — Retouches front suite à retour utilisateur (centrage, quantités, message tél., infos retrait)
- Contexte : première revue visuelle par l'utilisateur après F1-F7 (ouverture initiale en `file://`, corrigée séparément en expliquant la contrainte CORS sur les modules ES — aucun changement de code nécessaire pour ce point, juste la méthode pour lancer le front en local).
- **CSS (`frontend/css/styles.css`)** : page centrée verticalement et horizontalement (`body` en flex), contenu des cartes (titres, texte, formulaires, stepper, navigation, récapitulatif) centré. `.nav` passe de `justify-content: space-between` à `center`.
- **Étape Commande (`frontend/js/steps/order.js`)** : le champ central du stepper devient un `<input type="number" step="0.5">` éditable (au lieu d'un `<span>` figé) — un client peut taper directement une quantité avec une décimale en 0,5 pour commander par 500g. Les boutons +/- incrémentent désormais par défaut de **1 kg** (`BUTTON_STEP_KG`) au lieu de 0,5 kg ; l'arrondi au pas de 0,5 kg (jamais 100g) reste appliqué par `state.setProductQuantity` quelle que soit la saisie. Le champ n'est resynchronisé depuis l'état que s'il n'a pas le focus, pour ne jamais écraser une saisie en cours.
- **Message d'erreur téléphone** : la partie entre parenthèses (« format attendu : ... ») retirée du message, côté front (`frontend/js/steps/pii.js`) et côté back (`backend/src/services/validation.js`, pour qu'un rejet serveur affiche le même message simplifié) — ne reste que « Numéro de téléphone invalide. ».
- **Confirmation (`frontend/js/steps/confirmation.js`)** : date de retrait formatée en toutes lettres (`Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })`, ex. « 13 décembre 2026 » au lieu de « 2026-12-13 ») — `timeZone: 'UTC'` utilisé délibérément pour qu'une date calendaire sans heure ne puisse jamais glisser d'un jour selon le fuseau du navigateur du client.
- **Nouvelles informations pratiques** : `pickup_address` et `contact_phone` ajoutés aux settings (voir `.ai/mapping.md`), affichés sur la page de confirmation uniquement s'ils sont non vides (comportement identique à `news`, pas de ligne vide ni de placeholder trompeur tant qu'ils ne sont pas configurés).
- Tests : 5 tests backend ajoutés (`settings.test.js`, `adminSettings.test.js`, mêmes scénarios que `news`) — 136 tests verts. 6 tests frontend ajoutés (stepper par 1 kg, saisie libre à 500g, arrondi d'une saisie invalide, `formatDateLong`, affichage conditionnel adresse/contact) — 33 tests verts.
- Vérifié manuellement en conditions réelles (backend local relancé avec un vrai hash bcrypt de test, `pickup_address`/`contact_phone` configurés via `PUT /api/admin/settings`) : centrage visuel, saisie libre à 1,5 kg, message de validation simplifié, date longue + adresse + contact affichés correctement sur la page de confirmation. Base de dev, `.env` de test et cookies de session supprimés après vérification.

## 2026-11-07 — Planification du déploiement réel (`docs/plan-deploiement.md`)
- Contexte : backend et frontend fonctionnels et testés en local uniquement ; rien n'est déployé. Plan construit pour la connexion réelle Netlify (front) → proxy `/api/*` → Tailscale Funnel → backend Express sur la machine de production (architecture déjà retenue, CDC §8).
- Missions D1 à D6 découpées avec répartition claire de qui exécute quoi : D1 (Tailscale Funnel), D2 (secrets réels + `.env` prod), D3 (unités systemd) et la majeure partie de D5 (vérification en conditions réelles) nécessitent un accès physique/SSH à la machine de production que je n'ai pas — commandes et gabarits fournis dans le plan, exécution laissée à l'utilisateur. D4 (dépôt Git + `netlify.toml`) et D6 (mise à jour `.ai/`) peuvent être exécutés par moi.
- Point bloquant détecté et tranché avec l'utilisateur avant de considérer le plan prêt : le projet n'avait aucun dépôt Git, et Netlify a deux modes de déploiement (continu via Git, ou manuel CLI/glisser-déposer) non différenciés dans `.ai/decisions.md`. Décision retenue : dépôt Git + déploiement continu — voir `.ai/decisions.md`.
- Décisions en suspens déjà connues (prix réels, date de saison, durée de conservation, `pickup_address`/`contact_phone`) rappelées explicitement dans le plan comme non bloquantes pour la connexion technique, mais à trancher avant d'accepter de vraies commandes.
- Prochaine étape côté `/implementation` : initialiser le dépôt Git local et préparer `netlify.toml` (placeholder d'URL Tailscale tant que D1 n'est pas fait par l'utilisateur).

## 2026-11-07 — D4 (partie moi) : dépôt Git + netlify.toml (`docs/plan-deploiement.md`)
- Dépôt Git initialisé à la racine (`git init`) — le projet n'en avait aucun jusqu'ici. `.gitignore` racine ajouté (`node_modules/`, `backend/data/`, `backend/.env`, `graphify-out/`).
- `netlify.toml` créé : `publish = "frontend"`, redirection proxy `/api/*` → backend (status 200, même origine côté navigateur). L'URL `<machine>.ts.net` reste un placeholder tant que la mission D1 (Tailscale Funnel) n'est pas faite par l'utilisateur sur la machine de production.
- Premier commit (`b424864`) : contenu existant avant l'initialisation du dépôt (backend M1-M10+B0-B3, frontend F1-F7, `.ai/`, `docs/`, `netlify.toml`). Vérifié avant commit qu'aucun secret ni donnée locale n'était inclus (`.env`, `backend/data/`, `node_modules/`, `graphify-out/` absents du diff stagé).
- Suite de tests rejouée après coup (changements non applicatifs uniquement) : 136 tests backend + 33 tests frontend toujours verts.
- Reste à faire côté utilisateur pour achever D4 : créer le dépôt distant (GitHub ou autre) et le pousser, puis connecter Netlify dessus (« Import from Git »).

## 2026-11-07 — D4 : push initial vers GitHub (`docs/plan-deploiement.md`)
- Premier push refusé (403) : les identifiants Git en cache (compte `tezcatlypoca`, clé SSH par défaut `~/.ssh/id_ed25519`) n'ont pas les droits sur `Vaubon-ent/LaTradition`. Diagnostic via `~/.ssh/config` : deux alias existants (`github-perso` → `id_ed25519`, `github-pro` → `id_ed25519_pro`, tagué `vaubon.pro@gmail.com`).
- Remote `origin` reconfiguré en SSH via l'alias dédié : `git@github-pro:Vaubon-ent/LaTradition.git` (au lieu de l'URL HTTPS d'origine). `ssh -T git@github-pro` confirme l'authentification sous `Vaubon-ent`.
- Push réussi : branche `main` créée sur le dépôt distant avec le commit initial (`ccebbb6`, local branche renommée `master` → `main` avant le push pour suivre la convention GitHub).
- Reste à faire côté utilisateur pour terminer D4 : connecter ce dépôt à un site Netlify (« Import from Git »).

## 2026-11-07 — D1-D3 : backend déployé en conditions réelles sur BigBertha
- Contexte : plusieurs blocages en route, tous résolus en session interactive (voir détail ci-dessous) — aucun bug de code, uniquement de la configuration d'infrastructure sur la machine de production (BigBertha).
- **Incident évité de justesse** : `sudo tailscale down` exécuté par erreur sur la machine de production alors que Tailscale était le seul accès distant prévu — a coupé la connexion. Récupéré car la machine était aussi joignable en local/physiquement (pas de perte de service, les process tournant dessus, dont des agents Hermes, n'ont jamais été affectés : `tailscale down` ne coupe que le tunnel réseau, jamais les process). Leçon retenue : ne jamais suggérer de commande qui coupe une connexion réseau sans vérifier d'abord si c'est le seul accès disponible.
- **Tailscale Funnel** : nécessitait une activation préalable au niveau du tailnet (HTTPS Certificates + Funnel feature, console admin Tailscale), en plus de l'autorisation par-node — non documenté dans le plan initial, découvert en le vivant. URL obtenue : `https://bigbertha.tail6f4387.ts.net/`.
- **Conflit de port** : le port 3000 (par défaut) était déjà occupé par un process Hermes (`/home/bigbertha/.hermes/...`, PID 2798) tournant sur la machine — jamais touché. Backend reconfiguré sur le port **3001** (`.env`, `PORT=3001`), Funnel reconfiguré dessus.
- **`npm install` incomplet** à plusieurs reprises (`Cannot find module 'dotenv'` malgré des tentatives répétées) — résolu par un `rm -rf node_modules package-lock.json && npm install` propre.
- **Service systemd en échec** (`result: resources`) : la ligne `EnvironmentFile=` du gabarit `backend/deploy/boudins-backend.service` n'avait pas été adaptée au chemin réel de BigBertha (`/home/samuel/...` au lieu de `/home/bigbertha/Documents/LaTradition/backend/.env`) — `User=` et `WorkingDirectory=` avaient été corrigés mais pas cette ligne. Corrigé, service maintenant `active (running)`, démarrage automatique activé (`systemctl enable`).
- **Vérification finale** : `curl https://bigbertha.tail6f4387.ts.net/api/health` depuis une machine extérieure (le PC de dev Windows, hors réseau de BigBertha) → `200 OK`, `{"status":"ok"}`, en-têtes `helmet` (CSP) présents, confirmant que c'est bien le backend LaTradition qui répond via le Funnel.
- `netlify.toml` mis à jour avec l'URL Tailscale réelle (remplace le placeholder `<machine>.ts.net`).
- Restant pour considérer D1-D3 totalement clos : confirmer que `boudins-backup.timer` est bien actif (commandes données, résultat pas encore confirmé par l'utilisateur).
- Restant pour D4/D5 : URL Netlify définitive (pour `ALLOWED_ORIGIN` dans `.env` sur BigBertha), puis vérification CORS et parcours client complet en conditions réelles.

## 2026-11-07 — Fin de session : 502 Netlify détecté, correction poussée
- L'utilisateur a testé le front déployé sur Netlify : toutes les requêtes `/api/*` échouaient en `502`. Cause confirmée : le `netlify.toml` déployé sur Netlify était encore celui avec le placeholder `<machine>.ts.net` (jamais poussé avant ce test, malgré la correction faite localement plus tôt dans la session).
- Corrigé et poussé (commit `6042a44`) : `netlify.toml` pointe maintenant vers `https://bigbertha.tail6f4387.ts.net/api/:splat`. Netlify redéploie automatiquement (déploiement continu, D4).
- Non vérifié avant la fin de la session : que le redéploiement Netlify a bien eu lieu et que le 502 a disparu, et que `ALLOWED_ORIGIN` (toujours vide sur BigBertha) a été réglé avec l'URL Netlify réelle — l'utilisateur ne l'a pas communiquée. Tant que ce n'est pas fait, même sans 502, le backend renverra 403 (CORS) à toutes les requêtes du front.

## 2026-11-08 — Session-Start : vérification Graphify (palier strict)
- Graphe reconstruit intégralement (415 nœuds → 425 après clustering, 981 arêtes, 11 communautés) sur l'ensemble du projet (backend, frontend, docs, netlify.toml), comparé à l'État courant déclaré dans `.ai/project-context.md` : aucune contradiction détectée (tous les modules backend M1-M10/B0-B3 et le front F1-F7 retrouvés dans le graphe, `admin.html` bien absent du front comme déclaré, `netlify.toml` confirmé avec l'URL Tailscale réelle).
- `npm install` exécuté dans `backend/` (336 paquets) et `frontend/` (95 paquets), absents en début de session (environnement local non préparé). Suites de tests rejouées : 136/136 backend, 33/33 frontend, toujours vertes — aucune régression. 2 vulnérabilités modérées confirmées = la vulnérabilité `uuid@8.3.2`/`exceljs` déjà connue et documentée, rien de nouveau.

## 2026-11-08 — Dégrossissage + Challenge + Decision-Gel : route admin `/admin`
- Décisions retenues (détail et raisons dans `.ai/decisions.md`, section Retenues) : URL `/admin` via `frontend/admin/index.html` (sous-dossier servi nativement par Netlify, aucune modification de `netlify.toml`) + convention de chemins absolus imposée pour ce sous-dossier (JS, CSS, appels API) ; nouvel endpoint `GET /api/admin/session` réutilisant `requireAdminAuth` existant (M5) sans nouvelle logique d'auth ; wrapper `fetch` global interceptant tout 401 sur les appels admin pour gérer l'expiration de session en cours d'usage (JWT TTL 12h sans révocation serveur) — validé explicitement par l'utilisateur, règle d'autonomie « sécurité/authentification » du framework.
- Rejetées (raisons détaillées dans `.ai/decisions.md`) : `admin.html` à plat à la racine + redirect Netlify (nécessite une config supplémentaire, sans bénéfice net sur le sous-dossier) ; sous-domaine séparé (contraire à la demande explicite) ; détection de session via un endpoint métier existant plutôt qu'un endpoint dédié (couplage fragile, aucun gain réel à cette échelle).

## 2026-11-08 — M-ADM1 : `GET /api/admin/session` (`docs/plan-implementation-admin.md`)
- `backend/src/routes/admin/session.js` (`createAdminSessionRouter`) : `GET /session` → `{ ok: true }`, aucune logique propre — monté après `requireAdminAuth` dans `backend/src/app.js` (même groupe protégé que les autres routeurs admin), réutilise entièrement M5 sans nouvelle table ni nouveau service.
- Tests (`backend/tests/adminSession.test.js`) : sans cookie → 401, signature invalide → 401, cookie expiré → 401, cookie valide → 200 `{ ok: true }`. 140 tests verts au total (24 fichiers, +4).

## 2026-11-08 — M-ADM2 : squelette `frontend/admin/` (`docs/plan-implementation-admin.md`)
- `frontend/admin/index.html` : 3 `<section data-view>` (`loading`/`login`/`dashboard` placeholder) jamais détruites/recréées, chemins CSS/JS en absolu depuis la racine du domaine.
- `frontend/admin/js/adminState.js` : état plat `{ view, loginError }`, fonctions pures (`createInitialState`, `setView`, `setLoginError`), même pattern que `frontend/js/state.js`.
- `frontend/admin/js/adminApi.js` : `checkSession`/`login`/`logout` (chemins absolus `/api/admin/...`), `adminFetch` + `onUnauthorized(handler)` — handler enregistré une seule fois par `adminApp.js`, appelé par `adminFetch` sur tout 401 ; centralise la gestion de l'expiration de session pour toutes les futures vues métier sans qu'elles aient à s'en soucier.
- `frontend/admin/js/adminApp.js` : orchestrateur — détection de session au chargement, login (401 → message, 429 → message dédié), logout, enregistrement du handler `onUnauthorized` (bascule vers `login` + « session expirée, reconnectez-vous » à tout moment).
- `frontend/admin/css/admin.css` : feuille dédiée minimale, indépendante de `frontend/css/styles.css`.
- Tests (`frontend/tests/adminState.test.js`, `adminApi.test.js`, `adminApp.test.js`) : état pur, wrappers mockés (incluant la non-notification du handler pour une erreur ≠ 401), intégration DOM jsdom (chargement session valide/invalide, login correct/incorrect/verrouillé, logout, 401 reçu en cours d'usage via `adminFetch` direct, vérification que tous les appels admin interceptés restent en chemin absolu). 18 tests ajoutés — **51 tests front verts au total** (9 fichiers). Aucune régression sur le parcours client (33 tests déjà existants).
- M-ADM3 (vérification manuelle en conditions réelles) non exécutée : dépend du déblocage infra (502 Netlify/`ALLOWED_ORIGIN`), pas d'accès à la machine de production depuis cette session — reste à faire par l'utilisateur ou lors d'une session avec l'infra débloquée.

## 2026-11-08 — Contradiction signalée et corrigée : 502/CORS en réalité résolus
- Contexte : l'État courant déclarait un `502` Netlify et un `ALLOWED_ORIGIN` non configuré comme bloquants (hérités de la fin de session du 2026-11-07). L'utilisateur a signalé que ce n'était plus le cas et l'a vérifié en conditions réelles depuis le site Netlify déployé (pas en local) : `GET /api/products` → `304` (cache sur une réponse `200` déjà servie), `POST /api/check-phone` → `200`, `POST /api/orders` → `201` (commande réellement créée).
- Confirme que : le `netlify.toml` corrigé (commit `6042a44`, URL Tailscale réelle) a bien été redéployé par Netlify, et que `ALLOWED_ORIGIN` est désormais réglé sur BigBertha avec l'URL Netlify réelle (valeur exacte non communiquée à l'agent, mais effet vérifié de bout en bout — plus de 403 CORS).
- `.ai/project-context.md` (État courant, Problèmes connus) et `.ai/decisions.md` (section En suspens, point « URL Netlify définitive ») mis à jour en conséquence — plus aucun blocage infra connu sur le parcours client public. `boudins-backup.timer` reste le seul point d'infra encore à reconfirmer.

## 2026-11-08 — Planification : socle d'authentification du dashboard admin (`docs/plan-implementation-admin.md`)
- Plan créé, scope explicitement limité au socle d'authentification (route `/admin`, login, session, gestion 401 globale) — le contenu métier des vues (commandes, production, produits, paramètres, export, clients) reste hors scope : backend déjà prêt (M6-M8), interface à planifier séparément une fois son contenu/layout décidé.
- 3 missions priorisées : M-ADM1 (back, `GET /api/admin/session` + tests cas limites), M-ADM2 (front, squelette `admin/` complet — état, API, login, session, 401 global — avec tests unitaires/mockés/intégration DOM), M-ADM3 (vérification manuelle en conditions réelles, dépendante du déblocage 502/CORS déjà en cours, non bloquante pour M-ADM1/M-ADM2).
- Aucune décision en suspens bloquante identifiée pour ce plan. Prêt pour `/implementation`, pas encore démarré à la fin de cette session (aucun code écrit pour cette fonctionnalité).
