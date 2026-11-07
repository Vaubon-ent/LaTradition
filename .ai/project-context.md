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
- Design du parcours client front (5 étapes) exploré et gelé (`.ai/decisions.md`, 2026-11-07) : navigation par boutons + indicateur de progression, ordre Bienvenue → Commande → PII → Récap/Prix → Confirmation, cards produits avec +/- par 0,5 kg, brouillon `localStorage` nettoyé après confirmation, gestion d'état en vanilla JS (pas de passage à Svelte+Vite). Plan d'implémentation détaillé dans `docs/plan-implementation-frontend.md` (missions F1 à F7, pas encore commencées).
- Fonctionnalités restantes :
  - `frontend/` : toujours aucun fichier créé. Le formulaire client (5 étapes) est conçu et planifié (F1-F7) mais pas codé. Le tableau de bord admin reste entièrement à faire et à concevoir (pas de design discuté pour lui) — en particulier, il n'existe aujourd'hui **aucune interface** pour éditer `news` ou le nouveau `price_per_kg` : modification possible uniquement via appel API direct en attendant.
  - Déploiement réel (Netlify, Tailscale Funnel, `netlify.toml`, vraies unités systemd sur la machine de production) : non commencé — les fichiers `backend/deploy/` sont des gabarits à adapter (chemins, utilisateur système).
- État de préparation à la production : non prêt. Le backend (public + admin + sécurité transverse + exploitation documentée, y compris les extensions B0-B3) est fonctionnel et testé en local uniquement ; le frontend n'existe pas, et rien n'est réellement déployé. Aucune valeur réelle (prix, date de retrait, secrets `.env`, origine Netlify réelle) n'est en place — seulement des placeholders de développement.
- Problèmes connus : aucun bug ouvert. Un bug (`getActiveProductsById` ne remontait pas la colonne `active`) a été trouvé et corrigé pendant la session M4 — voir `change-log.md`. Le point relevé en fin de session précédente sur `minDelayMs` dans `src/server.js` a été vérifié : ce n'était pas un bug (valeur par défaut correctement appliquée via la chaîne de paramètres), désormais rendu explicite via `MIN_DELAY_MS`. Une contradiction entre une décision gelée et le code réel (format de prix) a été détectée et corrigée pendant cette session — voir `change-log.md` (B0) et `.ai/decisions.md`.
- Vulnérabilité connue non bloquante : dépendance transitive `uuid@8.3.2` (via `exceljs`) signalée modérée par `npm audit`, pas de version plus récente d'`exceljs` qui la corrige sans breaking change ; risque jugé faible (nécessite un buffer attaquant passé directement à `uuid`, jamais fait ici).
- Dernière mise à jour : 2026-11-07 (fin de session après Dégrossissage/Challenge/Decision-Gel/Planification du front + implémentation des extensions backend B0-B3 ; le code du front lui-même — F1-F7 — reste à faire).
