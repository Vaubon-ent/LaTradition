# Plan d'implémentation — Backend

> Prérequis : `.ai/project-rules.md`, Cadrage de `.ai/project-context.md`, `.ai/decisions.md` (Retenues), `docs/cahier-des-charges.md`.
> Palier de rigueur : **strict** → chaque mission ci-dessous inclut des tests unitaires et d'intégration couvrant les cas limites, pas seulement le chemin heureux.

## Décisions en suspens — non bloquantes mais à signaler
Ces points (voir `.ai/decisions.md`) n'empêchent pas de coder le moteur, mais doivent être tranchés avant la vraie saison :
- Prix des trois produits pour 500 g → utiliser des valeurs placeholder configurables (seed de dev) tant que non tranchées.
- Date de conception/retrait de la saison → idem, valeur placeholder dans `settings`, modifiable sans redéploiement.
- Durée de conservation des données clients entre saisons → la fonction de suppression/anonymisation (mission 8) sera prévue mais son déclenchement (manuel vs automatique après X mois) reste ouvert.

## Architecture concrète
Conforme à `docs/cahier-des-charges.md` §8.1 :
```
backend/
├── src/
│   ├── server.js
│   ├── routes/        # orders, admin, products, settings
│   ├── db/             # schéma SQLite, migrations, accès données
│   ├── services/       # calcul de prix, dates, export
│   └── middleware/     # auth admin, rate limit, validation
├── data/               # fichier SQLite (exclu du dépôt Git)
└── .env                # secrets (exclu du dépôt Git)
```

## Missions

### Priorité 1 — Moteur métier public (le plus sensible, CDC §9 : calcul et validation exclusivement serveur)

**M1. Squelette du projet backend**
- `package.json`, dépendances (express ou hono, better-sqlite3, dotenv, helmet), `.gitignore` (`data/`, `.env`), `server.js` minimal (écoute `localhost` uniquement).
- Test : démarrage du serveur, réponse sur une route de healthcheck.

**M2. Schéma SQLite + migrations + accès données (`db/`)**
- Tables `products`, `settings`, `customers`, `orders`, `order_items` (CDC §7.1).
- Script de migration + script de seed avec valeurs placeholder (prix, date de conception).
- Test : migrations idempotentes, contraintes (unicité téléphone par saison, `quantity_500g ≥ 1`, montants entiers).

**M3. Services métier (`services/`)**
- Service de calcul de prix : `quantité_500g × prix_500g`, tout en centimes entiers.
- Service de dates : fuseau `Europe/Paris`, `order_deadline` = `conception_date − 7 jours`, état verrouillé/déverrouillé.
- Tests unitaires (palier strict → cas limites explicites) :
  - quantité à 0 sur toutes les lignes → commande invalide ;
  - arrondis/centimes sur plusieurs lignes ;
  - limite exacte de la date butoir (avant/pendant/après, gestion DST Europe/Paris) ;
  - changement de prix après une commande existante → ne doit pas affecter les commandes passées.

**M3bis. Service anti-abus (`services/` + `middleware/`)**
- Nonce signé HMAC à usage unique : génération (timestamp + secret serveur), vérification de signature + TTL, détection de réutilisation via table `used_nonces` (purge après expiration).
- Middleware honeypot + délai minimum de soumission (champ caché CSS, rejet si rempli ou si soumission trop rapide après le chargement du formulaire).
- Décisions sources : `.ai/decisions.md` (Retenues, 2026-11-07).
- Tests unitaires : nonce valide accepté une fois, 2ᵉ présentation du même nonce rejetée, nonce expiré rejeté, signature invalide rejetée ; honeypot rempli rejeté, soumission trop rapide rejetée.

**M4. Endpoints publics**
- `GET /api/products` : liste des produits actifs.
- `GET /api/settings/public` : date de retrait, date limite, état du verrouillage, **nonce signé** pour la prochaine commande.
- `POST /api/orders` : validation stricte des entrées (nom, prénom, téléphone FR/international, au moins une quantité > 0), vérification du nonce (M3bis), dédoublonnage par téléphone sur la saison en cours, refus si verrouillé (date dépassée).
- Tests d'intégration : chemin heureux, validation échouée (téléphone invalide, toutes quantités à 0), commande après verrouillage, nonce absent/invalide/réutilisé, 2ᵉ commande même téléphone/saison rejetée, idempotence du prix figé dans `order_items`.

### Priorité 2 — Administration

**M5. Middleware auth admin**
- Hash bcrypt/argon2, session avec expiration, limitation des tentatives de connexion (anti brute-force).
- Tests : connexion valide/invalide, verrouillage après N tentatives, session expirée.

**M6. Endpoints admin — commandes et production**
- `POST /api/admin/login`, `POST /api/admin/logout`.
- `GET /api/admin/orders` (filtres statut/date, recherche nom/téléphone).
- `PATCH /api/admin/orders/:id/status`.
- `GET /api/admin/production` (totaux en kg par produit).
- Tests : accès refusé sans session, filtres/recherche, changement de statut, exactitude des totaux de production.

**M7. Export**
- `GET /api/admin/export.xlsx` (exceljs), `GET /api/admin/export.csv` (`;`, UTF-8 BOM).
- Test : colonnes minimales présentes (CDC §6.5), encodage correct, toutes les commandes incluses.

**M8. Endpoints admin — paramètres**
- `PUT /api/admin/products/:id`, `PUT /api/admin/settings`.
- Fonction de suppression/anonymisation des données client (CDC §7.3) — déclenchement manuel via admin pour l'instant, vu la décision en suspens sur la durée de conservation.
- Tests : modification de prix sans impact sur commandes passées, modification de date recalculant bien la date limite.

### Priorité 3 — Sécurité transverse et exploitation

**M9. Sécurité transverse**
- helmet, CORS restreint à l'origine Netlify, aucune donnée personnelle en URL, logs d'erreurs/connexions échouées sans données personnelles.
- Test : vérification des en-têtes de sécurité, requête cross-origin non autorisée rejetée.

**M10. Exploitation**
- Script de sauvegarde quotidienne du fichier SQLite (hors code applicatif, documenté dans `README.md` du backend).
- Config de démarrage automatique (service systemd ou équivalent) — documentation, pas de test automatisé possible ici.

## Dépendances entre missions
M1 → M2 → M3 → M3bis → M4 (chemin critique, priorité 1).
M4 → M5 → M6 → M7, M8 (priorité 2, nécessite des commandes existantes pour être testée en conditions réelles).
M9 peut être fait en parallèle dès M1. M10 en tout dernier, une fois le reste stable.

## Prêt pour `/implementation`
Ce plan est jugé suffisant pour démarrer M1 à M4 (incluant M3bis). Les missions 5+ pourront être affinées une fois la priorité 1 validée.
