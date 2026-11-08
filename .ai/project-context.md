# Contexte du projet — LaTradition (gestion des commandes de boudins)

## Cadrage
> Section figée après validation. Ne pas modifier sauf décision humaine explicite de réouverture de l'idée fondatrice.

- Palier de rigueur : strict
- Idée initiale : remplacer le carnet et les échanges informels, utilisés par le père de Samuel pour vendre des boudins une fois par an à une clientèle de famille et d'amis proches, par une application web de prise de commande et de suivi.
- Objectifs :
  1. Permettre à un client de commander en quelques taps depuis son téléphone.
  2. Afficher au client le total de sa commande après validation.
  3. Permettre au père de voir toutes les commandes, leur statut, et la quantité totale à fabriquer.
  4. Permettre l'export des commandes en Excel (.xlsx) ou CSV (compatible Google Sheets).
  5. Conserver les données clients d'une saison à l'autre.
- Utilisateurs concernés :
  - Clients (famille, amis proches) : passent commande depuis leur téléphone, environ 100 clients maximum, quelques centaines de commandes par saison.
  - Le père de Samuel (administrateur unique) : suit les commandes, gère la production, exporte les données, change les paramètres (prix, dates).
- Architecture voulue (peut être enrichie par les décisions retenues ultérieures) :
  - Front client + admin en HTML/CSS/JS vanilla, déployé sur Netlify.
  - Back Node.js/Express, SQLite local, exposé via Tailscale Funnel, derrière un proxy Netlify (`/api/*`).
  - Calcul de prix et validation de commande exclusivement côté serveur.
  - Paiement au retrait en V1 ; Stripe Checkout prévu en évolution hors V1.
  - Détail complet : voir `docs/cahier-des-charges.md`.

## État courant
> Section mise à jour à chaque Session-End. Reflète l'avancement réel, pas l'historique.

- Fonctionnalités terminées (backend, voir `docs/plan-implementation-backend.md`) :
  - M1 : squelette Express (`src/app.js`/`src/server.js`), healthcheck.
  - M2 : schéma SQLite, migrations idempotentes, seed placeholder (`src/db/{schema,connection,migrate,seed,setup}.js`).
  - M3 : services métier prix (`src/services/pricing.js`) et dates/verrouillage Europe/Paris avec gestion DST (`src/services/dates.js`).
  - M3bis : protection anti-abus de `POST /api/orders` sans compte client — nonce signé HMAC à usage unique (`src/services/nonce.js`, `src/db/nonceStore.js`), honeypot + délai minimum anti-falsifiable (`src/middleware/antiAbuseGuard.js`).
  - M4 : 3 endpoints publics fonctionnels — `GET /api/products`, `GET /api/settings/public`, `POST /api/orders` (validation, calcul de prix serveur, dédoublonnage téléphone/saison via contrainte DB, prix figé dans `order_items`).
  - M5 : auth admin — compte unique partagé (père de Samuel + Samuel), hash bcryptjs, session JWT (cookie httpOnly), verrou global anti brute-force après 5 échecs. `POST /api/admin/login`, `POST /api/admin/logout`.
  - M6 : `GET /api/admin/orders` (filtres statut/saison/recherche), `PATCH /api/admin/orders/:id/status`, `GET /api/admin/production` (totaux kg par produit).
  - M7 : `GET /api/admin/export.xlsx` (exceljs), `GET /api/admin/export.csv` (`;`, BOM UTF-8).
  - M8 : `PUT /api/admin/products/:id`, `PUT /api/admin/settings`, `POST /api/admin/customers/:id/anonymize` (anonymisation manuelle, déclenchement automatique toujours en suspens).
  - M9 : CORS restreint à `ALLOWED_ORIGIN` (bloque par défaut sinon), logs d'erreurs serveur/connexions admin échouées sans PII, en-têtes de sécurité (helmet, déjà en place depuis M1), vérification qu'aucune route n'expose de PII en URL.
  - M10 : script de sauvegarde quotidienne (`backend/scripts/backup.js`, `VACUUM INTO` + purge), exemples d'unités systemd pour démarrage automatique du serveur et de la sauvegarde (`backend/deploy/`, Linux confirmé pour la machine de production), `backend/README.md`.
  - 118 tests (vitest + supertest) verts ; vérification manuelle en conditions réelles à chaque mission (serveur réel : cycle commande → admin → production → export, CORS autorisé/refusé, sauvegarde relue et vérifiée).
  - **Le plan d'implémentation backend (`docs/plan-implementation-backend.md`) est maintenant couvert en entier (priorités 1 à 3, M1 à M10).**
  - B0-B1-B2-B3 (extensions backend pour le front, voir `docs/plan-implementation-frontend.md`) : migration du modèle de prix — `products.price_per_kg` est désormais la source de vérité (admin saisit un prix au kg), le prix par 500g facturé dans `order_items` est dérivé par calcul (`services/pricing.js`) ; `GET /api/products` expose `price_per_kg` ; champ `news` ajouté à `GET /api/settings/public`/`PUT /api/admin/settings` ; nouvel endpoint public `POST /api/check-phone` (détection de doublon téléphone/saison en live, vérifie le nonce sans le consommer). 131 tests verts (23 fichiers). `docs/cahier-des-charges.md` mis à jour en cohérence avec le nouveau modèle de prix.
- Front client (F1-F7, `frontend/`) : **entièrement codé et testé** (session du 2026-11-07, après celle qui a gelé le design). 5 étapes (Bienvenue → Commande → PII → Récap/Prix → Confirmation), vanilla JS sans outil de build, état centralisé dans `js/state.js`, brouillon `localStorage` (`js/draft.js`) limité à `{step, pii, items}` et nettoyé uniquement après confirmation serveur réussie. 33 tests (vitest + jsdom) verts. Détail des rôles dans `.ai/mapping.md`.
  - Retouches suite à une première revue visuelle de l'utilisateur (même session) : page centrée (CSS), stepper produit par pas de 1 kg avec champ central éditable pour une saisie libre à 500g, message d'erreur téléphone simplifié, date de retrait affichée en toutes lettres, ajout des champs `pickup_address`/`contact_phone` (settings, même traitement que `news`) affichés sur la confirmation s'ils sont renseignés.
- Backend : 136 tests verts (131 + 5 pour `pickup_address`/`contact_phone`, ajoutés cette session).
- Tableau de bord admin : **socle d'authentification implémenté** (`docs/plan-implementation-admin.md`) — M-ADM1 (`GET /api/admin/session`, réutilise `requireAdminAuth` existant) et M-ADM2 (`frontend/admin/` : login, détection de session, gestion globale des 401 en cours d'usage) faits et testés (140 tests back, 51 tests front). URL `/admin` via `frontend/admin/index.html`, chemins absolus (JS/CSS/API) comme convenu. M-ADM3 (vérification manuelle en conditions réelles) **non exécutée** — n'est plus bloquée par l'infra (502/CORS résolus, voir ci-dessous), reste à faire spécifiquement sur `/admin`. Le contenu métier des vues (commandes, production, édition `news`/`price_per_kg`/`pickup_address`/`contact_phone`, export, anonymisation) reste hors scope de ce plan — backend déjà prêt (M6-M8), modification possible uniquement via appel API direct en attendant l'interface.
- **Déploiement réel — en cours, pas encore totalement vérifié** (`docs/plan-deploiement.md`, missions D1 à D6) :
  - Dépôt Git créé et poussé sur GitHub (`Vaubon-ent/LaTradition`, branche `main`), via l'alias SSH `github-pro` (clé `vaubon.pro@gmail.com` — le compte Git par défaut de la machine de dev, `tezcatlypoca`, n'a pas les droits dessus).
  - Site Netlify créé et connecté au dépôt (déploiement continu). `netlify.toml` à jour avec l'URL Tailscale réelle (poussé, commit `6042a44`).
  - Backend déployé sur la machine de production (« BigBertha ») : service systemd `boudins-backend.service` actif (`enable --now`, redémarrage auto), tourne sur le port **3001** (3000 était déjà pris par un process Hermes tournant sur la même machine — jamais touché). Tailscale Funnel actif et vérifié joignable depuis l'extérieur (`https://bigbertha.tail6f4387.ts.net/api/health` → 200 OK, confirmé depuis une machine hors réseau de BigBertha).
  - `boudins-backup.timer` : commandes d'installation données à l'utilisateur, **statut non confirmé** (à vérifier en priorité à la reprise).
  - **502 et CORS résolus, vérifiés par l'utilisateur le 2026-11-08** : chaîne complète front Netlify → proxy → Tailscale Funnel → backend confirmée fonctionnelle en conditions réelles — `GET /api/products` (`304`, cache navigateur sur une réponse `200` déjà obtenue), `POST /api/check-phone` (`200`), `POST /api/orders` (`201`, commande réellement créée). `ALLOWED_ORIGIN` est donc bien configuré sur BigBertha avec l'URL Netlify réelle (valeur exacte non communiquée à l'agent, mais effet vérifié de bout en bout).
- État de préparation à la production : **chaîne technique front→back entièrement vérifiée en conditions réelles** (parcours client complet jusqu'à la création de commande). Aucune valeur métier réelle (prix, date de saison, durée de conservation, `pickup_address`/`contact_phone`) n'est en place — toujours des placeholders, à renseigner avant la vraie saison.
- Problèmes connus :
  - `boudins-backup.timer` à reconfirmer actif sur BigBertha.
  - Aucun bug de code ouvert. Historique des bugs déjà corrigés : voir `change-log.md` (M4, B0).
- Vulnérabilité connue non bloquante : dépendance transitive `uuid@8.3.2` (via `exceljs`) signalée modérée par `npm audit`, pas de version plus récente d'`exceljs` qui la corrige sans breaking change ; risque jugé faible (nécessite un buffer attaquant passé directement à `uuid`, jamais fait ici).
- Dernière mise à jour : 2026-11-08 (session : vérification Graphify en reprise — aucune contradiction code/doc détectée ; implémentation M-ADM1 (back, `GET /api/admin/session`) et M-ADM2 (front, squelette `frontend/admin/` — login, session, 401 global) du socle d'authentification admin, 140 tests back + 51 tests front verts ; puis contradiction signalée et corrigée — l'utilisateur a vérifié en conditions réelles que le 502 Netlify et le CORS/`ALLOWED_ORIGIN`, documentés comme bloquants en fin de session précédente, sont en réalité résolus : parcours client complet fonctionnel en production. M-ADM3 reste à faire, mais n'est plus bloquée par l'infra).
